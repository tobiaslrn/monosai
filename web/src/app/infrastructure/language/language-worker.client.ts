import type * as z from 'zod';
import type {
  AnalyzeTextRequest,
  AnalyzedSentence,
  AnalyzedText,
} from '../../domain/language/analyzed-text';
import type { ClassificationMode } from '../../domain/language/classification';
import type { DictionaryLookup, DictionaryQuery } from '../../domain/language/dictionary';
import type {
  ClassificationResult,
  CompiledSnapshotInfo,
  LanguageRuntime,
  LanguageRuntimeInfo,
  SentenceTokens,
} from '../../domain/language/language-runtime';
import { languageError, type LanguageError } from '../../domain/language/language-error';
import type { LanguageAssetManifest } from '../../domain/language/language-assets';
import type { SentenceSegment } from '../../domain/language/segmentation';
import type { VocabularyItem } from '../../domain/vocabulary/snapshot';
import { err, ok, type Result } from '../../domain/shared/result';
import type { Logger } from '../../application/shared/diagnostics';
import {
  LANGUAGE_PROTOCOL_VERSION,
  type LanguageRequest,
  type LanguageRequestMessage,
  type ResultFor,
} from './worker-protocol';
import {
  languageErrorSchema,
  languageResponseEnvelopeSchema,
  languageResultValueSchemas,
} from './worker-protocol.schema';

/**
 * Transport the client talks over. A real `Worker` and a test double both
 * satisfy it, which keeps the multiplexer testable without a Worker global.
 */
export interface LanguageWorkerChannel {
  post(message: LanguageRequestMessage): void;
  /**
   * Delivers every message, and reports a worker that can no longer answer.
   *
   * `onFailure` is how a worker that failed to load, threw outside a request,
   * was killed for memory, or sent a message that could not be read says so:
   * no response will ever arrive for what is pending.
   */
  subscribe(listener: (data: unknown) => void, onFailure?: () => void): () => void;
  terminate(): void;
}

/** A result whose operation is known but whose value is not yet validated. */
interface UncheckedResult {
  readonly operation: string;
  readonly value: unknown;
}

interface PendingRequest {
  readonly operation: LanguageRequest['operation'];
  readonly settle: (outcome: Result<UncheckedResult, LanguageError>) => void;
}

let requestCounter = 0;

function nextRequestId(): string {
  requestCounter += 1;
  return `r${String(requestCounter)}`;
}

function unexpectedResult(operation: string): LanguageError {
  return languageError(
    'invalid-response',
    'The language worker answered a different operation than requested.',
    operation,
  );
}

/**
 * Names where a worker answer broke its schema: paths and issue codes only,
 * never the values, which can carry the learner's text.
 */
function describeIssues(operation: string, error: z.ZodError): string {
  const issues = error.issues
    .slice(0, 3)
    .map((issue) => `${issue.path.join('.')}: ${issue.code}`)
    .join('; ');
  return `${operation}: ${issues}`;
}

function malformedResult(operation: string, error: z.ZodError): LanguageError {
  return languageError(
    'invalid-response',
    'The language worker answered with a malformed result.',
    describeIssues(operation, error),
  );
}

function malformedError(operation: string, error: z.ZodError): LanguageError {
  return languageError(
    'invalid-response',
    'The language worker answered with a malformed error.',
    describeIssues(operation, error),
  );
}

/**
 * Main-thread client for the language worker.
 *
 * It multiplexes concurrent requests by id, converts abort signals into
 * cooperative `cancel` messages, and drops any response whose request is no
 * longer pending, so a late answer from a cancelled analysis can never resolve a
 * newer request or reach the UI.
 *
 * A worker that stops answering (it failed to load, crashed, ran out of memory,
 * or sent a message that could not be read) fails everything pending with
 * `worker-terminated` and is dropped. The next request starts a fresh worker,
 * which knows nothing yet: listeners registered with `onStateLost` are told so
 * they initialize it again.
 */
export class LanguageWorkerClient implements LanguageRuntime {
  private readonly pending = new Map<string, PendingRequest>();
  private readonly stateLostListeners = new Set<() => void>();
  private connection: { channel: LanguageWorkerChannel; unsubscribe: () => void } | null;
  private disposed = false;

  constructor(
    private readonly openChannel: () => LanguageWorkerChannel,
    private readonly logger?: Logger,
  ) {
    this.connection = this.connect();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.disconnect(languageError('worker-terminated', 'The language worker was stopped.'));
    this.stateLostListeners.clear();
  }

  onStateLost(listener: () => void): () => void {
    this.stateLostListeners.add(listener);
    return () => {
      this.stateLostListeners.delete(listener);
    };
  }

  private connect(): { channel: LanguageWorkerChannel; unsubscribe: () => void } {
    const channel = this.openChannel();
    const unsubscribe = channel.subscribe(
      (data) => {
        this.receive(data);
      },
      () => {
        this.failed(channel);
      },
    );
    return { channel, unsubscribe };
  }

  /** Stops the current worker and fails what was waiting on it. */
  private disconnect(reason: LanguageError): void {
    const connection = this.connection;
    this.connection = null;
    connection?.unsubscribe();
    const pending = [...this.pending.values()];
    this.pending.clear();
    for (const request of pending) {
      request.settle(err(reason));
    }
    connection?.channel.terminate();
  }

  /**
   * Settles everything pending once the worker can no longer answer.
   *
   * Nothing else would: the requests wait for responses that will never come,
   * and language support would stay busy until a reload. The dead worker is
   * stopped and forgotten, so the next request starts a fresh one.
   */
  private failed(channel: LanguageWorkerChannel): void {
    if (this.disposed || this.connection?.channel !== channel) {
      return;
    }
    this.logger?.error('worker.failed', { worker: 'language' });
    this.disconnect(
      languageError('worker-terminated', 'The language worker stopped unexpectedly.'),
    );
    for (const listener of [...this.stateLostListeners]) {
      listener();
    }
  }

  initialize(
    baseUrl: string,
    manifest: LanguageAssetManifest,
    signal?: AbortSignal,
  ): Promise<Result<LanguageRuntimeInfo, LanguageError>> {
    return this.send('initialize', { baseUrl, manifest }, signal);
  }

  segment(
    text: string,
    signal?: AbortSignal,
  ): Promise<Result<readonly SentenceSegment[], LanguageError>> {
    return this.send('segment', { text }, signal);
  }

  analyzeText(
    input: AnalyzeTextRequest,
    signal?: AbortSignal,
  ): Promise<Result<AnalyzedText, LanguageError>> {
    return this.send('analyze', { text: input.text, unit: input.unit }, signal);
  }

  analyzeSentences(
    texts: readonly string[],
    signal?: AbortSignal,
  ): Promise<Result<readonly AnalyzedSentence[], LanguageError>> {
    return this.send('analyze-sentences', { texts }, signal);
  }

  lookup(
    query: DictionaryQuery,
    signal?: AbortSignal,
  ): Promise<Result<DictionaryLookup, LanguageError>> {
    return this.send('lookup', { query }, signal);
  }

  compileSnapshot(
    snapshotId: string,
    items: readonly VocabularyItem[],
    signal?: AbortSignal,
  ): Promise<Result<CompiledSnapshotInfo, LanguageError>> {
    return this.send('compile-snapshot', { snapshotId, items }, signal);
  }

  classify(
    snapshotId: string,
    mode: ClassificationMode,
    sentences: readonly SentenceTokens[],
    signal?: AbortSignal,
  ): Promise<Result<ClassificationResult, LanguageError>> {
    return this.send('classify', { snapshotId, mode, sentences }, signal);
  }

  private send<TOperation extends Exclude<LanguageRequest['operation'], 'cancel'>>(
    operation: TOperation,
    payload: Extract<LanguageRequest, { operation: TOperation }>['payload'],
    signal?: AbortSignal,
  ): Promise<Result<ResultFor<TOperation>, LanguageError>> {
    type Value = ResultFor<TOperation>;

    if (this.disposed) {
      this.logger?.error('language.operation.failed', {
        operation,
        errorCode: 'worker-unavailable',
      });
      return Promise.resolve(
        err(languageError('worker-unavailable', 'The language worker is not running.')),
      );
    }
    if (signal?.aborted === true) {
      this.logger?.debug('language.operation.failed', { operation, errorCode: 'cancelled' });
      return Promise.resolve(err(languageError('cancelled', 'The request was cancelled.')));
    }

    this.connection ??= this.connect();
    const { channel } = this.connection;
    const requestId = nextRequestId();
    this.logger?.debug('language.operation.started', { operation });
    return new Promise<Result<Value, LanguageError>>((resolve) => {
      let settled = false;
      const finish = (outcome: Result<Value, LanguageError>): void => {
        if (settled) {
          return;
        }
        settled = true;
        this.pending.delete(requestId);
        signal?.removeEventListener('abort', onAbort);
        resolve(outcome);
      };

      const onAbort = (): void => {
        // The worker is told to stop, and the pending entry is dropped so its
        // eventual answer is ignored on arrival rather than resolving anything.
        channel.post({
          protocolVersion: LANGUAGE_PROTOCOL_VERSION,
          requestId: nextRequestId(),
          request: { operation: 'cancel', payload: { targetRequestId: requestId } },
        });
        finish(err(languageError('cancelled', 'The request was cancelled.')));
      };

      this.pending.set(requestId, {
        operation,
        settle: (outcome) => {
          if (!outcome.ok) {
            this.logger?.error('language.operation.failed', {
              operation,
              errorCode: outcome.error.code,
            });
            finish(err(outcome.error));
            return;
          }
          if (outcome.value.operation !== operation) {
            this.logger?.error('language.operation.failed', {
              operation,
              errorCode: 'invalid-response',
            });
            finish(err(unexpectedResult(outcome.value.operation)));
            return;
          }
          const schema: z.ZodType<Value> = languageResultValueSchemas[operation];
          const value = schema.safeParse(outcome.value.value);
          if (!value.success) {
            this.logger?.error('language.operation.failed', {
              operation,
              errorCode: 'invalid-response',
            });
            finish(err(malformedResult(operation, value.error)));
            return;
          }
          this.logger?.debug('language.operation.succeeded', { operation });
          finish(ok(value.data));
        },
      });

      signal?.addEventListener('abort', onAbort, { once: true });
      channel.post({
        protocolVersion: LANGUAGE_PROTOCOL_VERSION,
        requestId,
        request: { operation, payload } as LanguageRequest,
      });
    });
  }

  private receive(data: unknown): void {
    const parsed = languageResponseEnvelopeSchema.safeParse(data);
    if (!parsed.success) {
      return;
    }
    const request = this.pending.get(parsed.data.requestId);
    if (request === undefined) {
      // Late answer to a cancelled or already settled request: drop it.
      return;
    }
    if (parsed.data.protocolVersion !== LANGUAGE_PROTOCOL_VERSION) {
      request.settle(
        err(
          languageError(
            'protocol-version-mismatch',
            'The language worker speaks a different protocol version.',
          ),
        ),
      );
      return;
    }
    if (!parsed.data.outcome.ok) {
      const error = languageErrorSchema.safeParse(parsed.data.outcome.error);
      request.settle(
        err(error.success ? error.data : malformedError(request.operation, error.error)),
      );
      return;
    }
    request.settle(ok(parsed.data.outcome.result));
  }
}

/** Wraps a real `Worker` as a channel. */
export function workerChannel(worker: Worker): LanguageWorkerChannel {
  return {
    post: (message) => {
      worker.postMessage(message);
    },
    subscribe: (listener, onFailure) => {
      const handler = (event: MessageEvent<unknown>): void => {
        listener(event.data);
      };
      const failure = (): void => {
        onFailure?.();
      };
      worker.addEventListener('message', handler);
      worker.addEventListener('error', failure);
      worker.addEventListener('messageerror', failure);
      return () => {
        worker.removeEventListener('message', handler);
        worker.removeEventListener('error', failure);
        worker.removeEventListener('messageerror', failure);
      };
    },
    terminate: () => {
      worker.terminate();
    },
  };
}
