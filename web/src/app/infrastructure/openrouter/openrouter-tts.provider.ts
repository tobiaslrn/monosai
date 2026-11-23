import { aiError, type AiError } from '../../domain/ai/ai-error';
import type { TtsConfig, TtsTest } from '../../domain/ai/model-test';
import {
  SPEECH_CODE_UNAVAILABLE,
  type AudioPayload,
  type TextToSpeechProvider,
  type TtsRequest,
} from '../../domain/ai/text-to-speech-provider';
import { safeErrorTypeOf } from '../../domain/shared/errors';
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
    let synthesizer: OpenRouterTtsSynthesizer;
    try {
      synthesizer = await untilAborted(this.synthesizer(), signal);
    } catch {
      // The port answers with a Result, and a chunk that cannot be fetched is
      // what a first synthesis meets on a device with no connection. Only this
      // load is speech code that could not load: the encoder's own load fails
      // as a Result inside the synthesizer, and keeps the paid clip.
      if (signal.aborted) {
        return cancelled();
      }
      return err(
        this.isOnline()
          ? aiError('unknown', 'tts-synthesis', 'The speech code could not be loaded.', {
              detail: { issueCode: SPEECH_CODE_UNAVAILABLE },
            })
          : aiError('offline', 'tts-synthesis', 'The device is offline.'),
      );
    }
    try {
      return await synthesizer.synthesize(input, signal);
    } catch (thrown) {
      // A fault after the code loaded is neither the connection nor the code:
      // it keeps its own kind, so a report says what actually threw. Only the
      // kind, since a thrown message can carry the text being read.
      if (signal.aborted) {
        return cancelled();
      }
      return err(
        aiError('unknown', 'tts-synthesis', `Speech synthesis threw ${safeErrorTypeOf(thrown)}.`),
      );
    }
  }
}

function cancelled(): Result<never, AiError> {
  return err(aiError('cancelled', 'tts-synthesis', 'The request was cancelled.'));
}
