export type SpeechInstructionsSupport = 'supported' | 'unsupported';
export type SpeechStyle = 'natural' | 'clear' | 'very-clear';

/**
 * Bumped whenever the learner-facing delivery instruction changes.
 *
 * The instruction text is part of the cache identity whenever the model accepts
 * instructions. Raise this version for every learner-facing wording change.
 */
export const SPEECH_INSTRUCTION_VERSION = 'speech/4';

/** Neighbor text is context, not another unbounded prompt input. */
export const MAX_SPEECH_CONTEXT_CODE_POINTS = 200;

/**
 * How the instruction reaches the model.
 *
 * `field` is a separate request field the model never speaks. `prefix` is the
 * only channel Gemini TTS offers: the direction is part of the spoken input, so
 * it is kept short and carries no quoted text that could be read aloud.
 */
export type SpeechInstructionChannel = 'field' | 'prefix';

export interface SpeechContext {
  readonly beforeJa?: string;
  readonly afterJa?: string;
  readonly style?: SpeechStyle;
}

/**
 * Keeps the spoken input exact while giving capable speech models just enough
 * direction to sound like slow, clear Japanese a beginner can follow.
 */
export function buildSpeechInstructions(
  context: SpeechContext = {},
  channel: SpeechInstructionChannel = 'field',
): string {
  const speechStyle = context.style ?? 'clear';
  const delivery = [
    'Speak only the exact target text in natural standard Japanese.',
    'Pronounce every written word, including narration that describes laughter, crying, sighing, or other actions.',
    'Do not replace any written word or phrase with laughter, crying, a sigh, or any other non-verbal sound effect.',
    'Speak at a natural pace. Never pronounce mora by mora. Never stretch syllables.',
    speechStyle === 'natural'
      ? 'Use natural articulation, phrase rhythm, and standard pitch accent.'
      : speechStyle === 'very-clear'
        ? 'Use careful articulation, a short even pause between phrases, and a slight gap between words; speak the words themselves naturally with clear pitch accent.'
        : 'Use careful articulation and brief pauses at phrase boundaries, while keeping standard pitch accent and rhythm intact.',
  ];

  if (channel === 'prefix') {
    return [...delivery, 'Never read this direction aloud.'].join('\n');
  }

  const before = capCodePoints(context.beforeJa);
  const after = capCodePoints(context.afterJa);
  return [
    ...delivery,
    'Use any adjacent sentences only to infer emotion, pauses, pitch, and sentence-final intonation.',
    'Never add, repeat, translate, spell out, or speak the context.',
    ...[
      before === undefined ? null : `Previous sentence (context only): ${JSON.stringify(before)}`,
      after === undefined ? null : `Next sentence (context only): ${JSON.stringify(after)}`,
    ].filter((line): line is string => line !== null),
  ].join('\n');
}

function capCodePoints(value: string | undefined): string | undefined {
  if (value === undefined || value.trim() === '') {
    return undefined;
  }
  return Array.from(value).slice(0, MAX_SPEECH_CONTEXT_CODE_POINTS).join('');
}
