import type { Result } from '../shared/result';
import type { AiError } from './ai-error';
import type { AudioMimeType } from '../enrichment/records';
import type { TtsConfig, TtsTest } from './model-test';
import type { SpeechContext, SpeechInstructionsSupport, SpeechStyle } from './speech-instructions';

/** One sentence's synthesis request, exactly as the cache key describes it. */
export interface TtsRequest extends SpeechContext {
  /** The exact saved Japanese. Never a normalized or re-segmented variant. */
  readonly text: string;
  readonly modelId: string;
  readonly voiceId: string;
  readonly speechStyle: SpeechStyle;
  /** The container asked for. MP3 is what the audio cache stores. */
  readonly responseFormat: 'mp3';
  readonly speechInstructions?: SpeechInstructionsSupport;
}

/** A verified clip, ready to be stored. */
export interface AudioPayload {
  readonly bytes: ArrayBuffer;
  readonly mimeType: AudioMimeType;
  /** The direction was carried, not necessarily obeyed. */
  readonly speechInstructionsApplied?: boolean;
}

/**
 * The audio side of the AI boundary.
 *
 * Separate from the text port because the two are configured, tested, and
 * allowed to fail independently: TTS is optional and must never block reading
 * or story generation.
 */
export interface TextToSpeechProvider {
  testConfiguration(config: TtsConfig, signal?: AbortSignal): Promise<Result<TtsTest, AiError>>;
  /**
   * Synthesizes one sentence. Never batches: the endpoint takes one input per
   * request and `ai-pipelines.md` section 11 fixes concurrency at one.
   */
  synthesize(input: TtsRequest, signal: AbortSignal): Promise<Result<AudioPayload, AiError>>;
}
