import type { z } from 'zod';
import { aiError, isAutomaticallyRetryable, type AiError } from '../../domain/ai/ai-error';
import type { AiTask } from '../../domain/ai/ai-task';
import type { CredentialRepository } from '../../domain/settings/credential-repository';
import { describeThrown } from '../../domain/shared/errors';
import { err, ok, type Result } from '../../domain/shared/result';
import {
  DEFAULT_REQUEST_TIMEOUT_MS,
  isOpenRouterUrl,
  MAX_AUDIO_RESPONSE_BYTES,
  MAX_JSON_RESPONSE_BYTES,
  OPENROUTER_BASE_URL,
} from './openrouter-endpoints';
import { mapHttpStatus, parseRetryAfterMs, type RequestContext } from './openrouter-error-mapping';
import { providerErrorEnvelopeSchema } from './openrouter-response.schema';
import { nextDelayMs } from './retry-policy';

/** Largest error body read for classification. Its content is never kept. */
const MAX_ERROR_BODY_BYTES = 64 * 1024;

export interface OpenRouterClientOptions {
  readonly fetchFn: typeof fetch;
  readonly credentials: CredentialRepository;
  /** Injected so an offline state is decided deterministically and testably. */
  readonly isOnline: () => boolean;
  /** Injected so backoff is instant in tests and real time in the browser. */
  readonly sleep: (ms: number) => Promise<void>;
  readonly random?: () => number;
  readonly baseUrl?: string;
  readonly correlationId?: () => string;
  /** Deadline for requests that do not set their own. */
  readonly defaultTimeoutMs?: number;
}

export interface OpenRouterRequest {
  readonly path: string;
  readonly task: AiTask;
  readonly body: Record<string, unknown>;
  /** Echoed into errors so the copy can name the setting that has to change. */
  readonly modelId?: string;
  readonly voiceId?: string;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}

export interface AudioResponse {
  readonly bytes: ArrayBuffer;
  readonly mimeType: string;
}

interface RawResponse {
  readonly bytes: ArrayBuffer;
  readonly contentType: string;
}

function contextOf(request: OpenRouterRequest): RequestContext {
  return {
    task: request.task,
    ...(request.modelId === undefined ? {} : { modelId: request.modelId }),
    ...(request.voiceId === undefined ? {} : { voiceId: request.voiceId }),
  };
}

function cancelled(task: AiTask): AiError {
  return aiError('cancelled', task, 'The request was cancelled.');
}

function offline(task: AiTask): AiError {
  return aiError('offline', task, 'The device is offline.');
}

/**
 * The single place an OpenRouter request is made.
 *
 * There is no general-purpose "call any URL" surface: the path comes from a
 * module constant, the target is checked against the configured origin before
 * an authorization header exists, and the key is only readable inside the
 * credential repository's callback. Timeouts, cancellation, bounded retry,
 * response size limits, and typed error mapping all happen here so that a task
 * adapter cannot forget one.
 */
export class OpenRouterClient {
  private readonly baseUrl: string;
  private readonly random: () => number;
  private readonly newCorrelationId: () => string;
  private readonly defaultTimeoutMs: number;

  constructor(private readonly options: OpenRouterClientOptions) {
    this.baseUrl = options.baseUrl ?? OPENROUTER_BASE_URL;
    this.random = options.random ?? Math.random;
    this.newCorrelationId =
      options.correlationId ?? ((): string => Math.random().toString(36).slice(2, 10));
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  }

  /**
   * Sends a task request and validates the answer against `schema`.
   *
   * A response that parses as JSON but not as the schema is a
   * `malformed-response`, never a partial success: no half-understood provider
   * payload is allowed further into the application.
   */
  async postJson<T>(request: OpenRouterRequest, schema: z.ZodType<T>): Promise<Result<T, AiError>> {
    const raw = await this.send(request, 'application/json', MAX_JSON_RESPONSE_BYTES);
    if (!raw.ok) {
      return raw;
    }
    if (!raw.value.contentType.includes('application/json')) {
      return err(this.malformed(request.task, 'content-type'));
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(new TextDecoder().decode(raw.value.bytes));
    } catch {
      return err(this.malformed(request.task, 'invalid-json'));
    }

    const parsed = schema.safeParse(parsedJson);
    if (!parsed.success) {
      const [issue] = parsed.error.issues;
      const path = issue.path.join('.');
      return err(this.malformed(request.task, `${path === '' ? 'root' : path}:${issue.code}`));
    }
    return ok(parsed.data);
  }

  /** Sends a synthesis request and returns the raw clip for validation. */
  async postAudio(request: OpenRouterRequest): Promise<Result<AudioResponse, AiError>> {
    const raw = await this.send(request, 'audio/mpeg', MAX_AUDIO_RESPONSE_BYTES);
    if (!raw.ok) {
      return raw;
    }
    return ok({ bytes: raw.value.bytes, mimeType: raw.value.contentType });
  }

  private malformed(task: AiTask, issueCode: string): AiError {
    // `issueCode` is derived from the schema path and never from the payload,
    // so it can be shown and logged without leaking provider content.
    return aiError('malformed-response', task, 'The provider answered in an unusable shape.', {
      detail: { issueCode },
    });
  }

  /**
   * Runs one request with bounded automatic retry.
   *
   * Retries stop at the policy limit, at the first non-transient failure, and
   * the moment the caller cancels, which is what keeps a retrying request from
   * outliving the screen that started it.
   */
  private async send(
    request: OpenRouterRequest,
    accept: string,
    maxBytes: number,
  ): Promise<Result<RawResponse, AiError>> {
    const aborted = (): boolean => request.signal?.aborted ?? false;
    let attempt = 0;
    for (;;) {
      const outcome = await this.attempt(request, accept, maxBytes);
      if (outcome.ok || !isAutomaticallyRetryable(outcome.error)) {
        return outcome;
      }
      if (aborted()) {
        return err(cancelled(request.task));
      }
      const delay = nextDelayMs(attempt, outcome.error.detail?.retryAfterMs, this.random);
      if (delay === null) {
        return outcome;
      }
      await this.options.sleep(delay);
      if (aborted()) {
        return err(cancelled(request.task));
      }
      attempt += 1;
    }
  }

  private async attempt(
    request: OpenRouterRequest,
    accept: string,
    maxBytes: number,
  ): Promise<Result<RawResponse, AiError>> {
    if (request.signal?.aborted === true) {
      return err(cancelled(request.task));
    }
    // Checked before the key is read, so an offline device never unlocks the
    // credential and never spends an attempt.
    if (!this.options.isOnline()) {
      return err(offline(request.task));
    }

    const url = `${this.baseUrl}${request.path}`;
    if (!isOpenRouterUrl(url, this.baseUrl)) {
      return err(
        aiError('unknown', request.task, 'Refused to send credentials to an unexpected address.', {
          detail: { correlationId: this.newCorrelationId() },
        }),
      );
    }

    const unlocked = await this.options.credentials.useApiKey((apiKey) =>
      this.exchange(url, apiKey, request, accept, maxBytes),
    );
    if (!unlocked.ok) {
      return err(
        unlocked.error.code === 'not-found'
          ? aiError('authentication', request.task, 'No OpenRouter key is saved.')
          : aiError('unknown', request.task, 'The saved key could not be read.', {
              cause: `storage/${unlocked.error.code}`,
              detail: { correlationId: this.newCorrelationId() },
            }),
      );
    }
    return unlocked.value;
  }

  /**
   * Performs the fetch itself.
   *
   * The key exists only as this function's parameter and only inside the
   * headers object handed to `fetch`; it is never assigned to a field, logged,
   * or placed in an error, which is what makes "no credential in logs, DOM, or
   * errors" a property of the code rather than a review promise.
   */
  private async exchange(
    url: string,
    apiKey: string,
    request: OpenRouterRequest,
    accept: string,
    maxBytes: number,
  ): Promise<Result<RawResponse, AiError>> {
    const controller = new AbortController();
    // Whether the deadline passed is tracked here rather than read off the
    // rejection, because what `fetch` throws on abort differs between
    // implementations and a timeout must not be reported as a cancellation.
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort(new DOMException('timeout', 'TimeoutError'));
    }, request.timeoutMs ?? this.defaultTimeoutMs);
    const forwardAbort = (): void => {
      controller.abort();
    };
    request.signal?.addEventListener('abort', forwardAbort, { once: true });

    try {
      const response = await this.options.fetchFn(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Accept: accept,
        },
        body: JSON.stringify(request.body),
        signal: controller.signal,
        credentials: 'omit',
        cache: 'no-store',
        mode: 'cors',
      });

      if (!response.ok) {
        return err(await this.describeRejection(response, request));
      }
      return await this.readBody(response, request, maxBytes);
    } catch (thrown) {
      return err(this.describeTransportFailure(thrown, request, timedOut));
    } finally {
      clearTimeout(timer);
      request.signal?.removeEventListener('abort', forwardAbort);
    }
  }

  /** Reads a rejected response only far enough to classify it. */
  private async describeRejection(
    response: Response,
    request: OpenRouterRequest,
  ): Promise<AiError> {
    let envelope: z.infer<typeof providerErrorEnvelopeSchema> | null;
    try {
      const text = (await response.text()).slice(0, MAX_ERROR_BODY_BYTES);
      const parsed = providerErrorEnvelopeSchema.safeParse(JSON.parse(text));
      envelope = parsed.success ? parsed.data : null;
    } catch {
      envelope = null;
    }
    return mapHttpStatus(
      response.status,
      contextOf(request),
      envelope,
      parseRetryAfterMs(response.headers.get('retry-after'), Date.now()),
      this.newCorrelationId(),
    );
  }

  private async readBody(
    response: Response,
    request: OpenRouterRequest,
    maxBytes: number,
  ): Promise<Result<RawResponse, AiError>> {
    // The declared length is checked first so an oversized body is refused
    // before it is buffered; the post-read check covers responses that do not
    // declare one.
    const declared = Number(response.headers.get('content-length') ?? '');
    if (Number.isFinite(declared) && declared > maxBytes) {
      return err(this.malformed(request.task, 'response-too-large'));
    }

    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > maxBytes) {
      return err(this.malformed(request.task, 'response-too-large'));
    }
    if (bytes.byteLength === 0) {
      return err(this.malformed(request.task, 'empty-body'));
    }
    return ok({
      bytes,
      contentType: (response.headers.get('content-type') ?? '').toLowerCase(),
    });
  }

  /**
   * Turns an opaque fetch rejection into the variant that describes what
   * actually went wrong.
   *
   * The browser reports a timeout, a user cancellation, and a dropped
   * connection through the same kind of failure, so the timeout flag and the
   * caller's signal are what separate them.
   */
  private describeTransportFailure(
    thrown: unknown,
    request: OpenRouterRequest,
    timedOut: boolean,
  ): AiError {
    if (timedOut) {
      return aiError('timeout', request.task, 'The provider did not answer in time.');
    }
    if (request.signal?.aborted === true) {
      return cancelled(request.task);
    }
    if (!this.options.isOnline()) {
      return offline(request.task);
    }
    return aiError('provider-unavailable', request.task, 'The provider could not be reached.', {
      cause: describeThrown(thrown),
    });
  }
}
