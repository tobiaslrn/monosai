import { DOCUMENT, inject, type Provider } from '@angular/core';
import { LOGGER, type Logger } from '../../application/shared/diagnostics';
import { AUDIO_DECODER, SPEECH_ENCODER } from '../../application/shared/ai-tokens';
import { speechEncodeError, type SpeechEncoder } from '../../domain/audio/speech-encoder';
import { err } from '../../domain/shared/result';
import { createAudioDecoder } from '../openrouter/audio-decode';
import { retryOnRejection, untilAborted } from './lazy-load';

/**
 * Binds the audio ports.
 *
 * The encoder is reached through a stand-in that loads the real client, and
 * with it the worker, on the first clip. Two reasons, and the second is the
 * binding one: a learner who never generates speech and has no stored clips to
 * compress should never pay for the codec at all, and these providers are
 * registered at startup, so anything imported here statically is in the bundle
 * every learner downloads before they can read a sentence.
 *
 * One worker for the session. Unlike the package worker, whose termination is
 * the only way a SQLite heap is returned, an idle encoder holds nothing worth
 * reclaiming, and restarting it per sentence would cost more than it saves.
 * A worker that fails is replaced on the next clip (`restartingSpeechEncoder`).
 */
export function provideAudioEncoding(): Provider[] {
  return [
    {
      provide: AUDIO_DECODER,
      useFactory: () => createAudioDecoder(inject(DOCUMENT).defaultView ?? globalThis.window),
    },
    {
      provide: SPEECH_ENCODER,
      useFactory: (): SpeechEncoder => {
        const logger = inject<Logger>(LOGGER);
        return restartingSpeechEncoder(async () => {
          const { SpeechEncoderClient, speechEncoderChannel } =
            await import('./speech-encoder.client');
          const worker = new Worker(
            new URL('../../../workers/audio/speech-encoder.worker', import.meta.url),
            { type: 'module', name: 'monosai-speech-encoder' },
          );
          return new SpeechEncoderClient(
            speechEncoderChannel(worker, () => {
              logger.error('worker.failed', { worker: 'speech-encoder' });
            }),
            logger,
          );
        });
      },
    },
  ];
}

/** A speech encoder that can tell its stand-in it will never answer again. */
export interface StoppableSpeechEncoder extends SpeechEncoder {
  readonly stopped: boolean;
}

/**
 * The stand-in the speech encoder port is bound to.
 *
 * It starts the real encoder on the first clip and keeps it for the session,
 * forgets a start that failed so the next clip asks again, and replaces an
 * encoder whose worker has stopped: the encodes it was running have already
 * failed, and the next clip gets a new worker instead of one that is gone.
 */
export function restartingSpeechEncoder(
  start: () => Promise<StoppableSpeechEncoder>,
): SpeechEncoder {
  let load = retryOnRejection(start);
  const current = async (): Promise<StoppableSpeechEncoder> => {
    const used = load;
    const encoder = await used();
    if (!encoder.stopped) {
      return encoder;
    }
    // Two clips can find the same stopped encoder; only the first replaces it.
    if (load === used) {
      load = retryOnRejection(start);
    }
    return load();
  };
  return {
    encode: async (input, signal) => {
      let encoder: SpeechEncoder;
      try {
        encoder = await untilAborted(current(), signal);
      } catch (error: unknown) {
        if (signal?.aborted === true) {
          return err(speechEncodeError('cancelled', 'The encode was cancelled.'));
        }
        throw error;
      }
      return encoder.encode(input, signal);
    },
  };
}
