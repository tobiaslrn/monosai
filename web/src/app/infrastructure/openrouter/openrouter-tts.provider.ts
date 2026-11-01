import { aiError, type AiError } from '../../domain/ai/ai-error';
import type { TtsConfig, TtsTest } from '../../domain/ai/model-test';
import {
  SPEECH_CODE_UNAVAILABLE,
  type AudioPayload,
  type TextToSpeechProvider,
  type TtsRequest,
} from '../../domain/ai/text-to-speech-provider';
import { err, type Result } from '../../domain/shared/result';
import { retryOnRejection, untilAborted } from '../audio/lazy-load';
import type { OpenRouterTtsSynthesizer } from './tts-synthesis.adapter';
import type { OpenRouterTtsTester } from './tts-test.adapter';

/** Supplies the synthesizer on first use, so it can be code-split. */
export type TtsSynthesizerLoader = () => Promise<OpenRouterTtsSynthesizer>;

/**
 * The whole speech port, composed from the adapters that implement it.
 *
 * Mirrors `OpenRouterTextProvider`: the tester's job is to prove one model,
 * voice, speaking style, and pace work, and the synthesizer's is to read a sentence. Keeping
 * them in separate files means neither grows the other's job, and this class
 * exists only so the injection token still resolves to one object.
 *
 * The synthesizer arrives through a loader rather than the constructor because
 * a learner who never turns on speech never needs it, and the port's methods
 * are already asynchronous so resolving it on first use costs nothing.
 */
export class OpenRouterTextToSpeechProvider implements TextToSpeechProvider {
  private readonly synthesizer: TtsSynthesizerLoader;

  constructor(
    private readonly tester: OpenRouterTtsTester,
    loadSynthesizer: TtsSynthesizerLoader,
    private readonly isOnline: () => boolean,
  ) {
    this.synthesizer = retryOnRejection(loadSynthesizer);
  }

  testConfiguration(config: TtsConfig, signal?: AbortSignal): Promise<Result<TtsTest, AiError>> {
    return this.tester.testConfiguration(config, signal);
  }

  async synthesize(input: TtsRequest, signal: AbortSignal): Promise<Result<AudioPayload, AiError>> {
    try {
      const synthesizer = await untilAborted(this.synthesizer(), signal);
      return await synthesizer.synthesize(input, signal);
    } catch {
      // The port answers with a Result, and a chunk that cannot be fetched, the
      // synthesizer's or the encoder's it calls, is what a first synthesis meets
      // on a device with no connection.
      if (signal.aborted) {
        return err(aiError('cancelled', 'tts-synthesis', 'The request was cancelled.'));
      }
      return err(
        this.isOnline()
          ? aiError('unknown', 'tts-synthesis', 'The speech code could not be loaded.', {
              detail: { issueCode: SPEECH_CODE_UNAVAILABLE },
            })
          : aiError('offline', 'tts-synthesis', 'The device is offline.'),
      );
    }
  }
}
