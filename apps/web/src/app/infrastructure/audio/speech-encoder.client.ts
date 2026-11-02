import {
  speechEncodeError,
  type EncodedSpeech,
  type SpeechEncodeError,
  type SpeechEncoder,
  type SpeechSamples,
} from '../../domain/audio/speech-encoder';
import { err, ok, type Result } from '../../domain/shared/result';
import type { Logger } from '../../application/shared/diagnostics';
import {
  SPEECH_ENCODER_PROTOCOL_VERSION,
  type SpeechEncoderRequestMessage,
} from './speech-encoder-protocol';
import { speechEncoderResponseEnvelopeSchema } from './speech-encoder-protocol.schema';

/**
 * Transport the client talks over. A real `Worker` and a test double both
 * satisfy it, which keeps the multiplexer testable without a Worker global.
 */
export interface SpeechEncoderChannel {
  post(message: SpeechEncoderRequestMessage, transfer?: readonly Transferable[]): void;
  subscribe(listener: (data: unknown) => void): () => void;
  terminate(): void;
}

let requestCounter = 0;

function nextRequestId(): string {
  requestCounter += 1;
  return `e${String(requestCounter)}`;
}

/**
 * Main-thread client for the speech encoder worker.
 *
 * It multiplexes requests by id, turns an abort signal into a cooperative
 * `cancel` message, and drops any response whose request is no longer pending,
 * so a clip from a cancelled reading can never be stored against a newer one.
 */
export class SpeechEncoderClient implements SpeechEncoder {
  private readonly pending = new Map<
    string,
    (outcome: Result<EncodedSpeech, SpeechEncodeError>) => void
  >();
  private readonly unsubscribe: () => void;
  private disposed = false;

  constructor(
    private readonly channel: SpeechEncoderChannel,
    private readonly logger?: Logger,
  ) {
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
    const stopped = speechEncodeError('worker-unavailable', 'The speech encoder was stopped.');
    for (const [, settle] of this.pending) {
      settle(err(stopped));
    }
    this.pending.clear();
    this.channel.terminate();
  }

  encode(
    input: SpeechSamples,
    signal?: AbortSignal,
  ): Promise<Result<EncodedSpeech, SpeechEncodeError>> {
    if (this.disposed) {
      return Promise.resolve(
        err(speechEncodeError('worker-unavailable', 'The speech encoder is not running.')),
      );
    }
    if (signal?.aborted === true) {
      return Promise.resolve(err(speechEncodeError('cancelled', 'The encode was cancelled.')));
    }

    const requestId = nextRequestId();
    // Copied rather than transferred: the caller keeps its samples, which the
    // maintenance pass needs in order to leave the stored row alone on failure.
    const samples = input.samples.slice();

    return new Promise<Result<EncodedSpeech, SpeechEncodeError>>((resolve) => {
      let settled = false;
      const finish = (outcome: Result<EncodedSpeech, SpeechEncodeError>): void => {
        if (settled) {
          return;
        }
        settled = true;
        this.pending.delete(requestId);
        signal?.removeEventListener('abort', onAbort);
        if (!outcome.ok) {
          this.logger?.error('worker.operation.failed', {
            worker: 'speech-encoder',
            errorCode: outcome.error.code,
          });
        }
        resolve(outcome);
      };

      const onAbort = (): void => {
        // The worker is told to stop, and the pending entry is dropped so its
        // eventual answer is ignored on arrival rather than resolving anything.
        this.channel.post({
          version: SPEECH_ENCODER_PROTOCOL_VERSION,
          requestId: nextRequestId(),
          request: { operation: 'cancel', payload: { requestId } },
        });
        finish(err(speechEncodeError('cancelled', 'The encode was cancelled.')));
      };

      this.pending.set(requestId, finish);
      signal?.addEventListener('abort', onAbort, { once: true });

      this.channel.post(
        {
          version: SPEECH_ENCODER_PROTOCOL_VERSION,
          requestId,
          request: {
            operation: 'encode',
            payload: {
              samples: samples.buffer,
              sampleRate: input.sampleRate,
              channels: input.channels,
            },
          },
        },
        [samples.buffer],
      );
    });
  }

  private receive(data: unknown): void {
    const parsed = speechEncoderResponseEnvelopeSchema.safeParse(data);
    if (!parsed.success) {
      return;
    }
    const message = parsed.data;
    const settle = this.pending.get(message.requestId);
    if (settle === undefined) {
      return;
    }
    if (!message.ok) {
      settle(err(message.error));
      return;
    }
    settle(ok({ bytes: message.result.value.bytes, mimeType: 'audio/webm' }));
  }
}

/** Wraps a real `Worker` as a channel, and reports a worker that fell over. */
export function speechEncoderChannel(worker: Worker, onError?: () => void): SpeechEncoderChannel {
  if (onError !== undefined) {
    worker.addEventListener('error', onError);
  }
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
      if (onError !== undefined) {
        worker.removeEventListener('error', onError);
      }
      worker.terminate();
    },
  };
}
