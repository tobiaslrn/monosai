/** The exact text-model configuration a learner supplies. */
export interface TextModelConfig {
  /** Exact provider model ID. No aliases, no defaults, no fuzzy matching. */
  readonly modelId: string;
}

/**
 * How the model produced valid structured output during its test.
 *
 * A model that needs the strict JSON contract still passes, but generation has
 * to budget for a format-recovery request, so the distinction is recorded
 * rather than flattened into a boolean.
 */
export type StructuredOutputMode = 'native-schema' | 'json-contract';

export interface ModelTest {
  readonly modelId: string;
  readonly structuredOutput: StructuredOutputMode;
}

/** The exact TTS configuration a learner supplies. */
export interface TtsConfig {
  readonly modelId: string;
  readonly voiceId: string;
  /** Playback rate multiplier. Providers that ignore it are reported, not hidden. */
  readonly speed: number;
}

export interface TtsTest {
  readonly modelId: string;
  readonly voiceId: string;
  /**
   * False when the provider rejected the speed parameter and the clip was
   * produced without it. The UI must say so rather than implying the setting
   * took effect.
   */
  readonly speedApplied: boolean;
  readonly mimeType: string;
  readonly byteLength: number;
  /** The verified clip, so the learner can play it on an explicit action. */
  readonly sample: Blob;
}
