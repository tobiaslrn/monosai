import type { z } from 'zod';
import type { Logger } from '../../../application/shared/diagnostics';
import { ankiError, type AnkiError, type AnkiErrorCode } from '../../../domain/anki/anki-error';
import { err, ok, type Result } from '../../../domain/shared/result';
import type { AllowedAction } from './allowed-actions';
import {
  cardIdListSchema,
  cardsInfoSchema,
  connectEnvelopeSchema,
  nameListSchema,
  notesInfoSchema,
  permissionSchema,
  versionSchema,
} from './connect-response.schema';

/**
 * The only endpoints Monosai will talk to.
 *
 * Arbitrary URLs are deliberately not accepted in v1: an allowlist of local
 * addresses is what keeps an "Anki connection" from becoming a way to point the
 * application at anything at all.
 */
export const DESKTOP_ENDPOINTS = ['http://127.0.0.1:8765', 'http://localhost:8765'] as const;

/** The unofficial Android bridge listens on the same port by convention. */
export const ANDROID_ENDPOINTS = ['http://127.0.0.1:8765', 'http://localhost:8765'] as const;

/** AnkiConnect's request format version, unrelated to the add-on's own version. */
const REQUEST_API_VERSION = 6;

const DEFAULT_TIMEOUT_MS = 5_000;

/** Largest response accepted, so a hostile or broken endpoint cannot exhaust memory. */
const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;

export type CardInfo = z.infer<typeof cardsInfoSchema>[number];
export type NoteInfo = z.infer<typeof notesInfoSchema>[number];
export type PermissionInfo = z.infer<typeof permissionSchema>;

export interface ConnectClientOptions {
  readonly endpoints: readonly string[];
  readonly fetchFn: typeof fetch;
  /**
   * The page's own origin. Used to tell a rejected origin from an endpoint that
   * is simply absent, because the browser reports both as an opaque failure,
   * and reported back as the cause so the learner knows which address to allow.
   */
  readonly pageOrigin: string;
  /** `not-running` for the desktop add-on, `bridge-not-running` for Android. */
  readonly unreachableCode: Extract<AnkiErrorCode, 'not-running' | 'bridge-not-running'>;
  readonly timeoutMs?: number;
  readonly logger?: Logger;
}

function isCancelled(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

function cancelled(): AnkiError {
  return ankiError('cancelled', 'The request was cancelled.');
}

/**
 * Whether the page is served from the local machine.
 *
 * AnkiConnect's origin allowlist defaults to `http://localhost` and exempts
 * `http://127.0.0.1` alongside it, so a page served from either address is
 * accepted out of the box while any other origin is refused until the learner
 * adds it. That is the difference between "nothing is listening" and "something
 * is listening but will not talk to this address", which the browser itself
 * reports identically.
 *
 * Measured against AnkiConnect 25.x: a request from an origin outside the
 * allowlist is answered `403` with a mismatched `Access-Control-Allow-Origin`,
 * so the browser rejects it during CORS. The add-on does answer the Private
 * Network Access preflight with `Access-Control-Allow-Private-Network: true`,
 * so a blocked private-network request is not the failure to report here.
 */
function isLocalPageOrigin(pageOrigin: string): boolean {
  return pageOrigin.startsWith('http://localhost') || pageOrigin.startsWith('http://127.0.0.1');
}

/**
 * Read-only client for an AnkiConnect-compatible endpoint.
 *
 * There is no public method that takes an action name. Every request goes
 * through the private `invoke`, whose `action` parameter is typed as
 * `AllowedAction`, and the public surface is one method per permitted action.
 * A write action is therefore unreachable from application code by
 * construction rather than by convention.
 */
export class AnkiConnectClient {
  private readonly timeoutMs: number;
  private activeEndpoint: string | null = null;

  constructor(private readonly options: ConnectClientOptions) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /** The endpoint that last answered, for diagnostics. */
  get endpoint(): string | null {
    return this.activeEndpoint;
  }

  version(signal?: AbortSignal): Promise<Result<number, AnkiError>> {
    return this.invoke('version', {}, versionSchema, 'unsupported-api', signal);
  }

  requestPermission(signal?: AbortSignal): Promise<Result<PermissionInfo, AnkiError>> {
    return this.invoke('requestPermission', {}, permissionSchema, 'permission-denied', signal);
  }

  deckNames(signal?: AbortSignal): Promise<Result<readonly string[], AnkiError>> {
    return this.invoke('deckNames', {}, nameListSchema, 'deck-discovery-failed', signal);
  }

  modelNames(signal?: AbortSignal): Promise<Result<readonly string[], AnkiError>> {
    return this.invoke('modelNames', {}, nameListSchema, 'note-type-discovery-failed', signal);
  }

  modelFieldNames(
    modelName: string,
    signal?: AbortSignal,
  ): Promise<Result<readonly string[], AnkiError>> {
    return this.invoke(
      'modelFieldNames',
      { modelName },
      nameListSchema,
      'field-discovery-failed',
      signal,
    );
  }

  findCards(query: string, signal?: AbortSignal): Promise<Result<readonly number[], AnkiError>> {
    return this.invoke('findCards', { query }, cardIdListSchema, 'query-failed', signal);
  }

  cardsInfo(
    cards: readonly number[],
    signal?: AbortSignal,
  ): Promise<Result<readonly CardInfo[], AnkiError>> {
    return this.invoke('cardsInfo', { cards }, cardsInfoSchema, 'query-failed', signal);
  }

  notesInfo(
    notes: readonly number[],
    signal?: AbortSignal,
  ): Promise<Result<readonly NoteInfo[], AnkiError>> {
    return this.invoke('notesInfo', { notes }, notesInfoSchema, 'query-failed', signal);
  }

  private async invoke<TValue>(
    action: AllowedAction,
    params: Record<string, unknown>,
    schema: z.ZodType<TValue>,
    failureCode: AnkiErrorCode,
    signal?: AbortSignal,
  ): Promise<Result<TValue, AnkiError>> {
    const logFailure = (error: AnkiError): Result<TValue, AnkiError> => {
      this.options.logger?.error('anki.operation.failed', {
        action,
        errorCode: error.code,
      });
      return err(error);
    };
    this.options.logger?.info('anki.operation.started', { action });
    if (isCancelled(signal)) {
      return logFailure(cancelled());
    }

    const attempted = this.activeEndpoint === null ? this.options.endpoints : [this.activeEndpoint];
    let lastTransportFailure: AnkiError | null = null;

    for (const endpoint of attempted) {
      const raw = await this.post(endpoint, action, params, signal);
      if (!raw.ok) {
        // A transport failure may just mean this address is not the one Anki
        // bound to, so the remaining candidates are still worth trying.
        if (raw.error.code === 'cancelled') {
          return logFailure(raw.error);
        }
        lastTransportFailure = raw.error;
        continue;
      }

      this.activeEndpoint = endpoint;
      const envelope = connectEnvelopeSchema.safeParse(raw.value);
      if (!envelope.success) {
        return logFailure(
          ankiError(
            'malformed-response',
            'Anki answered with something Monosai could not read.',
            action,
          ),
        );
      }
      if (envelope.data.error !== null) {
        return logFailure(this.describeRemoteError(action, envelope.data.error, failureCode));
      }

      const parsed = schema.safeParse(envelope.data.result);
      if (!parsed.success) {
        return logFailure(
          ankiError(
            'malformed-response',
            'Anki answered with something Monosai could not read.',
            `${action}: ${parsed.error.issues[0]?.message ?? 'unexpected shape'}`,
          ),
        );
      }
      this.options.logger?.info('anki.operation.succeeded', { action });
      return ok(parsed.data);
    }

    return logFailure(lastTransportFailure ?? ankiError('unknown', 'Anki could not be reached.'));
  }

  /**
   * Turns AnkiConnect's error string into a typed variant.
   *
   * The add-on reports an unknown action with a recognizable message, which is
   * how an endpoint that is running but too old to answer is told apart from
   * one that answered badly.
   */
  private describeRemoteError(
    action: AllowedAction,
    message: string,
    failureCode: AnkiErrorCode,
  ): AnkiError {
    const lowered = message.toLowerCase();
    if (lowered.includes('unsupported action') || lowered.includes('unknown action')) {
      return ankiError(
        'unsupported-action',
        'This Anki connection does not support an action Monosai needs.',
        action,
      );
    }
    if (lowered.includes('permission') || lowered.includes('denied')) {
      return ankiError(
        'permission-denied',
        'Anki refused the connection. Allow Monosai in the AnkiConnect settings and try again.',
        action,
      );
    }
    if (lowered.includes('api key')) {
      return ankiError(
        'permission-denied',
        'This Anki connection requires an API key, which Monosai does not support.',
        action,
      );
    }
    return ankiError(failureCode, 'Anki could not answer that request.', `${action}: ${message}`);
  }

  private async post(
    endpoint: string,
    action: AllowedAction,
    params: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<Result<unknown, AnkiError>> {
    const controller = new AbortController();
    // Whether the deadline passed is tracked here rather than read off the
    // rejection, because what `fetch` throws on abort differs between
    // implementations and a timeout must not be reported as a cancellation.
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort(new DOMException('timeout', 'TimeoutError'));
    }, this.timeoutMs);
    const forwardAbort = (): void => {
      controller.abort();
    };
    signal?.addEventListener('abort', forwardAbort, { once: true });

    try {
      const response = await this.options.fetchFn(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, version: REQUEST_API_VERSION, params }),
        signal: controller.signal,
        // The endpoint is local and unauthenticated; sending anything with the
        // request would only widen what a rogue local listener could see.
        credentials: 'omit',
        cache: 'no-store',
        mode: 'cors',
      });

      if (!response.ok) {
        return err(
          ankiError(
            'unsupported-api',
            'The Anki connection answered with an unexpected status.',
            `HTTP ${String(response.status)}`,
          ),
        );
      }

      const text = await response.text();
      if (text.length > MAX_RESPONSE_BYTES) {
        return err(
          ankiError('malformed-response', 'The Anki connection sent an unreasonably large answer.'),
        );
      }
      try {
        return ok(JSON.parse(text));
      } catch {
        return err(
          ankiError('malformed-response', 'Anki answered with something that is not JSON.'),
        );
      }
    } catch (thrown) {
      return err(this.describeTransportFailure(thrown, signal, timedOut));
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', forwardAbort);
    }
  }

  /**
   * Names an opaque `fetch` failure.
   *
   * The browser reports a refused connection and a rejected origin identically,
   * so two things separate them: an origin outside AnkiConnect's default
   * allowlist is refused by the add-on however healthy it is, and an endpoint
   * that has answered before is plainly present. Only a local origin that has
   * never had an answer is genuinely unreachable.
   */
  private describeTransportFailure(
    thrown: unknown,
    signal: AbortSignal | undefined,
    timedOut: boolean,
  ): AnkiError {
    if (isCancelled(signal)) {
      return cancelled();
    }
    if (timedOut) {
      return ankiError('timeout', 'Anki did not answer in time.');
    }
    if (thrown instanceof DOMException && thrown.name === 'AbortError') {
      return cancelled();
    }
    if (!isLocalPageOrigin(this.options.pageOrigin) || this.activeEndpoint !== null) {
      // Either this page is served from an address AnkiConnect does not allow
      // by default, or something answered here before and is now refusing the
      // request. Both are the origin list, not an absent add-on.
      return ankiError(
        'origin-not-allowed',
        'Anki refused a request from Monosai. Add this address to the AnkiConnect origin list and try again.',
        this.options.pageOrigin,
      );
    }
    return ankiError(
      this.options.unreachableCode,
      this.options.unreachableCode === 'not-running'
        ? 'Anki does not appear to be running with AnkiConnect installed.'
        : 'The Anki bridge does not appear to be running.',
    );
  }
}
