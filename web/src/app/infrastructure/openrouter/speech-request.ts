import { buildSpeechInstructions, type SpeechContext } from '../../domain/ai/speech-instructions';
import { isGeminiTtsModel } from '../../domain/ai/tts-configuration';

/**
 * Separates the direction from the sentence Gemini is meant to speak.
 *
 * Gemini TTS has no instructions field: the direction rides in `input`, so the
 * text has to be introduced clearly enough that the model speaks it and not the
 * lines above it.
 */
const GEMINI_TEXT_SEPARATOR = '\n\nSpeak this text and nothing else:\n';

export interface SpeechRequestInput {
  readonly modelId: string;
  readonly voiceId: string;
  /** The exact saved Japanese. Never a normalized or re-segmented variant. */
  readonly text: string;
  /** The container asked for, when the family lets it be chosen. */
  readonly responseFormat: 'mp3';
  /** The speed to request, or `undefined` when it is not being asked for. */
  readonly speed: number | undefined;
  /** Delivery direction to carry, or `undefined` when none is being sent. */
  readonly instruction: SpeechContext | undefined;
}

/**
 * The one place a speech request body is built.
 *
 * The configuration test and sentence synthesis have to send the same shape —
 * a test that proved a body synthesis does not send proves nothing (ADR 0018) —
 * so the two adapters differ only in what they put in, never in how it is laid
 * out.
 *
 * Two families, one function: Gemini takes its direction through the prompt and
 * returns raw PCM, everything OpenAI-compatible takes `instructions` and `speed`
 * as top-level fields.
 */
export function buildSpeechRequestBody(input: SpeechRequestInput): Record<string, unknown> {
  const gemini = isGeminiTtsModel(input.modelId);
  const instructed = input.instruction !== undefined;
  // Gemini ignores `speed` rather than refusing it, so sending it would record
  // a capability the learner never got.
  const speed = gemini ? undefined : input.speed;

  return {
    model: input.modelId,
    voice: input.voiceId,
    input:
      gemini && instructed
        ? `${buildSpeechInstructions(input.instruction, 'prefix')}${GEMINI_TEXT_SEPARATOR}${input.text}`
        : input.text,
    response_format: gemini ? 'pcm' : input.responseFormat,
    ...(speed === undefined ? {} : { speed }),
    ...(instructed && !gemini
      ? { instructions: buildSpeechInstructions(input.instruction, 'field') }
      : {}),
  };
}
