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
import {
  LANGUAGE_PROTOCOL_VERSION,
  type LanguageRequest,
  type LanguageRequestMessage,
  type LanguageResult,
  type ResultFor,
} from './worker-protocol';
import { languageResponseEnvelopeSchema } from './worker-protocol.schema';

/**
 * Transport the client talks over. A real `Worker` and a test double both
 * satisfy it, which keeps the multiplexer testable without a Worker global.
 */
export interface LanguageWorkerChannel {
  post(message: LanguageRequestMessage): void;
  subscribe(listener: (data: unknown) => void): () => void;
  terminate(): void;
}

interface PendingRequest {
  readonly operation: LanguageRequest['operation'];
  readonly settle: (outcome: Result<LanguageResult, LanguageError>) => void;
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
 * Main-thread client for the language worker.
 *
 * It multiplexes concurrent requests by id, converts abort signals into
 * cooperative `cancel` messages, and drops any response whose request is no
 * longer pending, so a late answer from a cancelled analysis can never resolve a
 * newer request or reach the UI.
 */
export class LanguageWorkerClient implements LanguageRuntime {
  private readonly pending = new Map<string, PendingRequest>();
  private readonly unsubscribe: () => void;
  private disposed = false;

  constructor(private readonly channel: LanguageWorkerChannel) {
    this.unsubscribe = channel.subscribe((data) => {
      this.receive(data);
    });
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.unsubscribe();
    const terminated = languageError('worker-terminated', 'The language worker was stopped.');
    for (const [, request] of this.pending) {
      request.settle(err(terminated));
    }
    this.pending.clear();
    this.channel.terminate();
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
      return Promise.resolve(
        err(languageError('worker-unavailable', 'The language worker is not running.')),
      );
    }
    if (signal?.aborted === true) {
      return Promise.resolve(err(languageError('cancelled', 'The request was cancelled.')));
    }

    const requestId = nextRequestId();
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
        this.channel.post({
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
            finish(err(outcome.error));
            return;
          }
          if (outcome.value.operation !== operation) {
            finish(err(unexpectedResult(outcome.value.operation)));
            return;
          }
          finish(ok(outcome.value.value as Value));
        },
      });

      signal?.addEventListener('abort', onAbort, { once: true });
      this.channel.post({
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
      request.settle(err(parsed.data.outcome.error as LanguageError));
      return;
    }
    request.settle(ok(parsed.data.outcome.result as unknown as LanguageResult));
  }
}

/** Wraps a real `Worker` as a channel. */
export function workerChannel(worker: Worker): LanguageWorkerChannel {
  return {
    post: (message) => {
      worker.postMessage(message);
    },
    subscribe: (listener) => {
      const handler = (event: MessageEvent<unknown>): void => {
        listener(event.data);
      };
      worker.addEventListener('message', handler);
      return () => {
        worker.removeEventListener('message', handler);
      };
    },
    terminate: () => {
      worker.terminate();
    },
  };
}
