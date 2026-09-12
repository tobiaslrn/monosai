import { inject, type Provider } from '@angular/core';
import { LOGGER, type Logger } from '../../application/shared/diagnostics';
import { SPEECH_ENCODER } from '../../application/shared/ai-tokens';
import { SpeechEncoderClient, speechEncoderChannel } from './speech-encoder.client';

/**
 * Binds the speech encoder port to its worker.
 *
 * One worker for the session, created when something first asks for the token
 * rather than at startup: a learner who never generates audio and has no stored
 * clips to compress should never pay for the codec at all. It is not terminated
 * between clips — unlike the package worker, whose termination is the only way
 * a SQLite heap is returned, an idle audio encoder holds nothing worth
 * reclaiming, and restarting it per sentence would cost more than it saves.
 */
export function provideAudioEncoding(): Provider[] {
  return [
    {
      provide: SPEECH_ENCODER,
      useFactory: () => {
        const logger = inject<Logger>(LOGGER);
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
      },
    },
  ];
}
