import {
  buildSpeechInstructions,
  SPEECH_PACE_SPEED,
  type SpeechContext,
  type SpeechPace,
  type SpeechStyle,
} from '../../domain/ai/speech-instructions';

/**
 * The containers OpenRouter's speech endpoint can be asked for.
 *
 * MP3 is preferred because it is small on the wire and stored as it arrives.
 * PCM is what the models that refuse MP3 return instead; it is compressed on
 * the way in (see `provider-audio.ts`).
 */
export type SpeechResponseFormat = 'mp3' | 'pcm';

export interface SpeechRequestInput {
  readonly modelId: string;
  /** Empty when the model has no voice catalog and picks its own. */
  readonly voiceId: string;
  /** The exact saved Japanese. Never a normalized or re-segmented variant. */
  readonly text: string;
  readonly responseFormat: SpeechResponseFormat;
  readonly speechStyle: SpeechStyle;
  readonly speechPace: SpeechPace;
  /** Delivery direction to carry, or `undefined` when none is being sent. */
  readonly instruction: SpeechContext | undefined;
  /** Allows the adapters to drop a refused numeric speed on the final retry. */
  readonly speed?: boolean;
}

/**
 * The one place a speech request body is built.
 *
 * The configuration test and sentence synthesis have to send the same shape —
 * a test that proved a body synthesis does not send proves nothing (ADR 0018) —
 * so the two adapters differ only in what they put in, never in how it is laid
 * out.
 *
 * One shape for every model family. The spoken `input` is only ever the text:
 * direction goes in OpenRouter's `instructions` field, which every family
 * either honours or ignores. A direction folded into `input` is read aloud by
 * any model that does not recognise it as one.
 */
export function buildSpeechRequestBody(input: SpeechRequestInput): Record<string, unknown> {
  const instructed = input.instruction !== undefined;
  const includeSpeed = input.speed ?? !instructed;
  const voice = input.voiceId.trim();

  return {
    model: input.modelId,
    ...(voice === '' ? {} : { voice }),
    input: input.text,
    response_format: input.responseFormat,
    ...(input.instruction === undefined
      ? {}
      : {
          instructions: buildSpeechInstructions({
            ...input.instruction,
            pace: input.speechPace,
            style: input.speechStyle,
          }),
        }),
    ...(!instructed && includeSpeed ? { speed: SPEECH_PACE_SPEED[input.speechPace] } : {}),
  };
}
