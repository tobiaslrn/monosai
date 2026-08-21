import type { Result } from '../shared/result';
import type { AiError } from './ai-error';
import type { AudioMimeType } from '../enrichment/records';
import type { TtsConfig, TtsTest } from './model-test';

/** One sentence's synthesis request, exactly as the cache key describes it. */
export interface TtsRequest {
  /** The exact saved Japanese. Never a normalized or re-segmented variant. */
  readonly text: string;
  readonly modelId: string;
  readonly voiceId: string;
  readonly speed: number;
  /** The container asked for. MP3 is what the audio cache stores. */
  readonly responseFormat: 'mp3';
}

/** A verified clip, ready to be stored. */
export interface AudioPayload {
  readonly bytes: ArrayBuffer;
  readonly mimeType: AudioMimeType;
  /**
   * False when the provider refused the speed parameter and the clip was
   * produced without it, so the surface can say so rather than implying the
   * setting took effect (ADR 0018).
   */
  readonly speedApplied: boolean;
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
