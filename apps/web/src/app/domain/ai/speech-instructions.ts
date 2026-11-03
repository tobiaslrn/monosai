export type SpeechInstructionsSupport = 'supported' | 'unsupported';
export type SpeechStyle = 'natural' | 'clear' | 'very-clear';
export type SpeechPace = 'natural' | 'slow' | 'very-slow';

/** Numeric pace values used only when a provider has no instruction channel. */
export const SPEECH_PACE_SPEED: Record<SpeechPace, number> = {
  natural: 1,
  slow: 0.9,
  'very-slow': 0.8,
};

/**
 * Bumped whenever the learner-facing delivery instruction changes.
 *
 * The instruction text is part of the cache identity whenever the model accepts
 * instructions. Raise this version for every learner-facing wording change.
 */
export const SPEECH_INSTRUCTION_VERSION = 'speech/6';

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
  readonly pace?: SpeechPace;
}

/**
 * Keeps the spoken input exact while giving capable speech models just enough
 * direction to sound like clear Japanese a beginner can follow. Articulation
 * and speaking rate stay independent: neither control asks for added silence.
 */
export function buildSpeechInstructions(
  context: SpeechContext = {},
  channel: SpeechInstructionChannel = 'field',
): string {
  const speechStyle = context.style ?? 'clear';
  const speechPace = context.pace ?? 'natural';
  const delivery = [
    'Speak only the exact target text in natural standard Japanese.',
    'Pronounce every written word, including narration that describes laughter, crying, sighing, or other actions.',
    'Do not replace any written word or phrase with laughter, crying, a sigh, or any other non-verbal sound effect.',
    paceDescription(speechPace),
    'Keep this speaking rate steady throughout the sentence without lengthening the silences.',
    articulationDescription(speechStyle),
    'Use fluent, connected Japanese phrasing. Pause only where punctuation or a natural clause boundary requires it, keep every pause brief, and never insert silence between words or morae.',
    'Never pronounce mora by mora. Never stretch syllables.',
  ];

  if (channel === 'prefix') {
    return [...delivery, 'Never read this direction aloud.'].join('\n');
  }

  const before = capCodePoints(context.beforeJa);
  const after = capCodePoints(context.afterJa);
  return [
    ...delivery,
    'Use any adjacent sentences only to infer emotion, phrasing, pitch, and sentence-final intonation.',
    'Never add, repeat, translate, spell out, or speak the context.',
    ...[
      before === undefined ? null : `Previous sentence (context only): ${JSON.stringify(before)}`,
      after === undefined ? null : `Next sentence (context only): ${JSON.stringify(after)}`,
    ].filter((line): line is string => line !== null),
  ].join('\n');
}

function paceDescription(pace: SpeechPace): string {
  switch (pace) {
    case 'natural':
      return 'Pace: use the ordinary speaking rate of a native speaker reading aloud to another adult native speaker.';
    case 'slow':
      return "Pace: use a moderately slower speaking rate for an intermediate learner, while preserving fluid delivery and each phrase's natural rhythm.";
    case 'very-slow':
      return "Pace: use a distinctly slower speaking rate for a beginner following the written text, while preserving fluid delivery and each phrase's natural rhythm.";
  }
}

function articulationDescription(style: SpeechStyle): string {
  switch (style) {
    case 'natural':
      return 'Articulation: use natural articulation, connected phrasing, and standard pitch accent.';
    case 'clear':
      return 'Articulation: pronounce sounds precisely and clearly without over-enunciating; preserve connected phrasing, natural rhythm, and standard pitch accent.';
    case 'very-clear':
      return 'Articulation: use especially precise sound definition without over-enunciating or separating words; preserve connected phrasing, natural rhythm, and standard pitch accent.';
  }
}

function capCodePoints(value: string | undefined): string | undefined {
  if (value === undefined || value.trim() === '') {
    return undefined;
  }
  return Array.from(value).slice(0, MAX_SPEECH_CONTEXT_CODE_POINTS).join('');
}
