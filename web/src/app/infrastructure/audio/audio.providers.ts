import { DOCUMENT, inject, type Provider } from '@angular/core';
import { LOGGER, type Logger } from '../../application/shared/diagnostics';
import { AUDIO_DECODER, SPEECH_ENCODER } from '../../application/shared/ai-tokens';
import type { SpeechEncoder } from '../../domain/audio/speech-encoder';
import { createAudioDecoder } from '../openrouter/audio-decode';

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
        let client: Promise<SpeechEncoder> | null = null;
        const load = async (): Promise<SpeechEncoder> => {
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
        };
        return {
          encode: async (input, signal) => {
            client ??= load();
            return (await client).encode(input, signal);
          },
        };
      },
    },
  ];
}
