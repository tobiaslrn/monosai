import type { AiError } from '../../domain/ai/ai-error';
import type { TtsConfig, TtsTest } from '../../domain/ai/model-test';
import type {
  AudioPayload,
  TextToSpeechProvider,
  TtsRequest,
} from '../../domain/ai/text-to-speech-provider';
import type { Result } from '../../domain/shared/result';
import type { OpenRouterTtsSynthesizer } from './tts-synthesis.adapter';
import type { OpenRouterTtsTester } from './tts-test.adapter';

/** Supplies the synthesizer on first use, so it can be code-split. */
export type TtsSynthesizerLoader = () => Promise<OpenRouterTtsSynthesizer>;

/**
 * The whole speech port, composed from the adapters that implement it.
 *
 * Mirrors `OpenRouterTextProvider`: the tester's job is to prove one model,
 * voice, and speed work, and the synthesizer's is to read a sentence. Keeping
 * them in separate files means neither grows the other's job, and this class
 * exists only so the injection token still resolves to one object.
 *
 * The synthesizer arrives through a loader rather than the constructor because
 * a learner who never turns on speech never needs it, and the port's methods
 * are already asynchronous so resolving it on first use costs nothing.
 */
export class OpenRouterTextToSpeechProvider implements TextToSpeechProvider {
  private synthesizer: OpenRouterTtsSynthesizer | null = null;

  constructor(
    private readonly tester: OpenRouterTtsTester,
    private readonly loadSynthesizer: TtsSynthesizerLoader,
  ) {}

  testConfiguration(config: TtsConfig, signal?: AbortSignal): Promise<Result<TtsTest, AiError>> {
    return this.tester.testConfiguration(config, signal);
  }

  async synthesize(input: TtsRequest, signal: AbortSignal): Promise<Result<AudioPayload, AiError>> {
    this.synthesizer ??= await this.loadSynthesizer();
    return this.synthesizer.synthesize(input, signal);
  }
}
