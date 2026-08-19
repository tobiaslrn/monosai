import type { z } from 'zod';
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
   * The page's own origin. Used to tell a blocked private-network request from
   * a rejected origin, because the browser reports both as an opaque failure.
   */
  readonly pageOrigin: string;
  /** `not-running` for the desktop add-on, `bridge-not-running` for Android. */
  readonly unreachableCode: Extract<AnkiErrorCode, 'not-running' | 'bridge-not-running'>;
  readonly timeoutMs?: number;
}

function isCancelled(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

function cancelled(): AnkiError {
  return ankiError('cancelled', 'The request was cancelled.');
}

/**
 * Whether the browser will subject this request to a Private Network Access
 * preflight.
 *
 * Chrome requires a public page reaching a private address to receive an
 * `Access-Control-Allow-Private-Network` header, which AnkiConnect does not
 * send. A page served over `http://localhost` is not public and is exempt, so
 * this distinguishes the deployed application from local development — and it
 * is the difference between telling someone to fix their CORS list and telling
 * them the browser will not allow the connection at all.
 */
function subjectToPrivateNetworkAccess(pageOrigin: string): boolean {
  if (pageOrigin.startsWith('http://localhost') || pageOrigin.startsWith('http://127.0.0.1')) {
    return false;
  }
  return pageOrigin.startsWith('https://') || pageOrigin.startsWith('http://');
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
    if (isCancelled(signal)) {
      return err(cancelled());
    }

    const attempted = this.activeEndpoint === null ? this.options.endpoints : [this.activeEndpoint];
    let lastTransportFailure: AnkiError | null = null;

    for (const endpoint of attempted) {
      const raw = await this.post(endpoint, action, params, signal);
      if (!raw.ok) {
        // A transport failure may just mean this address is not the one Anki
        // bound to, so the remaining candidates are still worth trying.
        if (raw.error.code === 'cancelled') {
          return raw;
        }
        lastTransportFailure = raw.error;
        continue;
      }

      this.activeEndpoint = endpoint;
      const envelope = connectEnvelopeSchema.safeParse(raw.value);
      if (!envelope.success) {
        return err(
          ankiError(
            'malformed-response',
            'Anki answered with something Monosai could not read.',
            action,
          ),
        );
      }
      if (envelope.data.error !== null) {
        return err(this.describeRemoteError(action, envelope.data.error, failureCode));
      }

      const parsed = schema.safeParse(envelope.data.result);
      if (!parsed.success) {
        return err(
          ankiError(
            'malformed-response',
            'Anki answered with something Monosai could not read.',
            `${action}: ${parsed.error.issues[0]?.message ?? 'unexpected shape'}`,
          ),
        );
      }
      return ok(parsed.data);
    }

    return err(lastTransportFailure ?? ankiError('unknown', 'Anki could not be reached.'));
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
   * The browser reports a refused connection, a rejected origin, and a blocked
   * private-network request identically, so the page's own origin is what
   * separates them: a public page reaching a local address is blocked before
   * CORS is ever consulted, while a local development page that fails has
   * either found nothing listening or been refused by the add-on's origin list.
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
    if (subjectToPrivateNetworkAccess(this.options.pageOrigin)) {
      return ankiError(
        'private-network-blocked',
        'Your browser blocked Monosai from reaching Anki on this computer. Use an Anki package instead.',
        this.options.pageOrigin,
      );
    }
    if (this.activeEndpoint !== null) {
      // Something answered here before, so the address is right and the add-on
      // is now refusing this origin rather than being absent.
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
