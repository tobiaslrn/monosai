import { ankiError, type AnkiError } from '../../../domain/anki/anki-error';
import { err, ok, type Result } from '../../../domain/shared/result';
import {
  PACKAGE_PROTOCOL_VERSION,
  type PackageRequest,
  type PackageRequestMessage,
  type PackageResult,
  type ResultFor,
} from './package-protocol';
import { packageResponseEnvelopeSchema } from './package-protocol.schema';

/**
 * Transport the client talks over. A real `Worker` and a test double both
 * satisfy it, which keeps the multiplexer testable without a Worker global.
 */
export interface PackageWorkerChannel {
  post(message: PackageRequestMessage, transfer?: readonly Transferable[]): void;
  subscribe(listener: (data: unknown) => void): () => void;
  terminate(): void;
}

interface PendingRequest {
  readonly operation: PackageRequest['operation'];
  readonly settle: (outcome: Result<PackageResult, AnkiError>) => void;
}

let requestCounter = 0;

function nextRequestId(): string {
  requestCounter += 1;
  return `p${String(requestCounter)}`;
}

function cancelled(): AnkiError {
  return ankiError('cancelled', 'The request was cancelled.');
}

/**
 * Main-thread client for the package worker.
 *
 * It multiplexes concurrent requests by id, converts abort signals into
 * cooperative `cancel` messages, and drops any response whose request is no
 * longer pending, so a late answer from a cancelled extraction can never resolve
 * a newer request or reach the UI.
 */
export class PackageWorkerClient {
  private readonly pending = new Map<string, PendingRequest>();
  private readonly unsubscribe: () => void;
  private disposed = false;

  constructor(private readonly channel: PackageWorkerChannel) {
    this.unsubscribe = channel.subscribe((data) => {
      this.receive(data);
    });
  }

  /**
   * Stops the worker.
   *
   * Terminating is the point: it is what returns the SQLite heap and the
   * decompressed collection to the browser, which a `close` message alone
   * cannot guarantee.
   */
  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.unsubscribe();
    const stopped = ankiError('cancelled', 'The package worker was stopped.');
    for (const [, request] of this.pending) {
      request.settle(err(stopped));
    }
    this.pending.clear();
    this.channel.terminate();
  }

  /** Transfers the archive so the main thread stops holding a second copy. */
  open(
    archive: ArrayBuffer,
    wasmUrl: string,
    signal?: AbortSignal,
  ): Promise<Result<ResultFor<'open'>, AnkiError>> {
    return this.send('open', { archive, wasmUrl }, signal, [archive]);
  }

  discover(signal?: AbortSignal): Promise<Result<ResultFor<'discover'>, AnkiError>> {
    return this.send('discover', {}, signal);
  }

  extract(
    payload: Extract<PackageRequest, { operation: 'extract' }>['payload'],
    signal?: AbortSignal,
  ): Promise<Result<ResultFor<'extract'>, AnkiError>> {
    return this.send('extract', payload, signal);
  }

  close(): Promise<Result<ResultFor<'close'>, AnkiError>> {
    return this.send('close', {});
  }

  private send<TOperation extends Exclude<PackageRequest['operation'], 'cancel'>>(
    operation: TOperation,
    payload: Extract<PackageRequest, { operation: TOperation }>['payload'],
    signal?: AbortSignal,
    transfer?: readonly Transferable[],
  ): Promise<Result<ResultFor<TOperation>, AnkiError>> {
    type Value = ResultFor<TOperation>;

    if (this.disposed) {
      return Promise.resolve(
        err(ankiError('package-unreadable', 'The package worker is not running.')),
      );
    }
    if (signal?.aborted === true) {
      return Promise.resolve(err(cancelled()));
    }

    const requestId = nextRequestId();
    return new Promise<Result<Value, AnkiError>>((resolve) => {
      let settled = false;
      const finish = (outcome: Result<Value, AnkiError>): void => {
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
          protocolVersion: PACKAGE_PROTOCOL_VERSION,
          requestId: nextRequestId(),
          request: { operation: 'cancel', payload: { targetRequestId: requestId } },
        });
        finish(err(cancelled()));
      };

      this.pending.set(requestId, {
        operation,
        settle: (outcome) => {
          if (!outcome.ok) {
            finish(err(outcome.error));
            return;
          }
          if (outcome.value.operation !== operation) {
            finish(
              err(
                ankiError(
                  'malformed-response',
                  'The package worker answered a different operation than requested.',
                  outcome.value.operation,
                ),
              ),
            );
            return;
          }
          finish(ok(outcome.value.value as Value));
        },
      });

      signal?.addEventListener('abort', onAbort, { once: true });
      this.channel.post(
        {
          protocolVersion: PACKAGE_PROTOCOL_VERSION,
          requestId,
          request: { operation, payload } as PackageRequest,
        },
        transfer,
      );
    });
  }

  private receive(data: unknown): void {
    const parsed = packageResponseEnvelopeSchema.safeParse(data);
    if (!parsed.success) {
      return;
    }
    const request = this.pending.get(parsed.data.requestId);
    if (request === undefined) {
      // Late answer to a cancelled or already settled request: drop it.
      return;
    }
    if (parsed.data.protocolVersion !== PACKAGE_PROTOCOL_VERSION) {
      request.settle(
        err(
          ankiError('unsupported-api', 'The package worker speaks a different protocol version.'),
        ),
      );
      return;
    }
    if (!parsed.data.outcome.ok) {
      request.settle(err(parsed.data.outcome.error as AnkiError));
      return;
    }
    request.settle(ok(parsed.data.outcome.result as unknown as PackageResult));
  }
}

/** Wraps a real `Worker` as a channel. */
export function packageWorkerChannel(worker: Worker): PackageWorkerChannel {
  return {
    post: (message, transfer) => {
      worker.postMessage(message, transfer === undefined ? [] : [...transfer]);
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
