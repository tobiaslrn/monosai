import type { Result } from '../shared/result';
import type { AiError } from './ai-error';
import type { TtsConfig, TtsTest } from './model-test';

/**
 * The audio side of the AI boundary.
 *
 * Separate from the text port because the two are configured, tested, and
 * allowed to fail independently: TTS is optional and must never block reading
 * or story generation. Sentence synthesis joins this port in Milestone 9.
 */
export interface TextToSpeechProvider {
  testConfiguration(config: TtsConfig, signal?: AbortSignal): Promise<Result<TtsTest, AiError>>;
}
