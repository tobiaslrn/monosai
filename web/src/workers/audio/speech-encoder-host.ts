import { speechEncodeError, type SpeechEncodeError } from '../../app/domain/audio/speech-encoder';
import { describeThrown } from '../../app/domain/shared/errors';
import {
  SPEECH_ENCODER_PROTOCOL_VERSION,
  type SpeechEncoderResponseMessage,
  type SpeechEncoderResult,
} from '../../app/infrastructure/audio/speech-encoder-protocol';
import { speechEncoderRequestMessageSchema } from '../../app/infrastructure/audio/speech-encoder-protocol.schema';
import { encodeOpusWebm, type WebCodecsAudio } from './opus-encoding';

export interface SpeechEncoderHostDependencies {
  readonly post: (
    message: SpeechEncoderResponseMessage,
    transfer?: readonly Transferable[],
  ) => void;
  /**
   * Resolves the platform encoder, or `null` where the browser has none.
   *
   * A function rather than a value so the host can be exercised without
   * WebCodecs, and so a browser without it answers `unsupported` per request
   * rather than failing to start the worker at all.
   */
  readonly codecs: () => WebCodecsAudio | null;
}

function readRequestId(data: unknown): string {
  if (typeof data === 'object' && data !== null) {
    const candidate = (data as { requestId?: unknown }).requestId;
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate;
    }
  }
  return '';
}

/**
 * The speech encoder worker's behaviour, with no Worker global in sight.
 *
 * Requests are handled one at a time. Four synthesis jobs run at once
 * (ADR 0034), but a clip's encode is a fraction of the request that produced
 * it, so four encoders would be four codec heaps to save nothing; the queue
 * simply waits its turn here.
 */
export class SpeechEncoderHost {
  private readonly cancelled = new Set<string>();
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly dependencies: SpeechEncoderHostDependencies) {}

  handleMessage(data: unknown): Promise<void> {
    const parsed = speechEncoderRequestMessageSchema.safeParse(data);
    if (!parsed.success) {
      this.fail(
        readRequestId(data),
        speechEncodeError('invalid-input', 'The speech encoder received an unusable message.'),
      );
      return Promise.resolve();
    }

    const { version, requestId, request } = parsed.data;
    if (version !== SPEECH_ENCODER_PROTOCOL_VERSION) {
      this.fail(
        requestId,
        speechEncodeError(
          'worker-unavailable',
          'The speech encoder speaks a different protocol version.',
          `client ${String(version)}, worker ${String(SPEECH_ENCODER_PROTOCOL_VERSION)}`,
        ),
      );
      return Promise.resolve();
    }

    if (request.operation === 'cancel') {
      this.cancelled.add(request.payload.requestId);
      return Promise.resolve();
    }

    // Serialized rather than concurrent: see the class comment.
    this.queue = this.queue.then(() => this.run(requestId, request.payload));
    return this.queue;
  }

  private async run(
    requestId: string,
    payload: { samples: ArrayBuffer; sampleRate: number; channels: number },
  ): Promise<void> {
    if (this.cancelled.delete(requestId)) {
      this.fail(requestId, speechEncodeError('cancelled', 'The encode was cancelled.'));
      return;
    }
    const controller = new AbortController();
    try {
      const encoded = await encodeOpusWebm(
        {
          samples: new Int16Array(payload.samples),
          sampleRate: payload.sampleRate,
          channels: payload.channels,
        },
        this.dependencies.codecs(),
        controller.signal,
      );
      if (this.cancelled.delete(requestId)) {
        this.fail(requestId, speechEncodeError('cancelled', 'The encode was cancelled.'));
        return;
      }
      if (encoded.ok) {
        this.succeed(requestId, { operation: 'encode', value: { bytes: encoded.value.bytes } }, [
          encoded.value.bytes,
        ]);
      } else {
        this.fail(requestId, encoded.error);
      }
    } catch (thrown) {
      this.fail(
        requestId,
        speechEncodeError(
          'unknown',
          'The speech encoder could not complete the request.',
          describeThrown(thrown),
        ),
      );
    }
  }

  private succeed(
    requestId: string,
    result: SpeechEncoderResult,
    transfer?: readonly Transferable[],
  ): void {
    this.dependencies.post(
      { version: SPEECH_ENCODER_PROTOCOL_VERSION, requestId, ok: true, result },
      transfer,
    );
  }

  private fail(requestId: string, error: SpeechEncodeError): void {
    this.dependencies.post({
      version: SPEECH_ENCODER_PROTOCOL_VERSION,
      requestId,
      ok: false,
      error,
    });
  }
}
