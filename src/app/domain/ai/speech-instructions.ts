export type SpeechInstructionsSupport = 'supported' | 'unsupported';

/**
 * Bumped whenever the learner-facing delivery instruction changes.
 *
 * Deliberately not bumped when the instruction text first became reachable:
 * `speech/3` describes no stored clip, because `speechInstructions` defaulted
 * to `'unsupported'` and nothing ever set it, so no request had ever carried an
 * instruction. The constant sits unconditionally in `audioOptionsFingerprint`,
 * where a bump would discard every paid clip without correcting one.
 *
 * That reasoning expires with the first instructed clip. From then on every
 * change to this text must raise the version.
 */
export const SPEECH_INSTRUCTION_VERSION = 'speech/3';

/** Neighbor text is context, not another unbounded prompt input. */
export const MAX_SPEECH_CONTEXT_CODE_POINTS = 200;

/**
 * How the instruction reaches the model.
 *
 * `field` is a separate request field the model never speaks. `prefix` is the
 * only channel Gemini TTS offers: the direction is part of the spoken input, so
 * it is kept short and carries no quoted text that could be read aloud.
 */
export type SpeechInstructionStyle = 'field' | 'prefix';

export interface SpeechContext {
  readonly beforeJa?: string;
  readonly afterJa?: string;
  /**
   * The speed actually being requested, when one is.
   *
   * `speed` is a separate API parameter that is dropped for models that do not
   * support it and after a capability refusal, so an instruction that named
   * "the requested speed" unconditionally would sometimes refer to nothing.
   * For a model with no numeric `speed` at all this line is the only way the
   * pace is communicated, which is why it is stated whenever a speed is asked
   * for rather than only when the parameter is sent.
   */
  readonly speed?: number;
}

/**
 * Keeps the spoken input exact while giving capable speech models just enough
 * direction to sound like slow, clear Japanese a beginner can follow.
 */
export function buildSpeechInstructions(
  context: SpeechContext = {},
  style: SpeechInstructionStyle = 'field',
): string {
  const delivery = [
    'Speak only the exact target text in natural standard Japanese.',
    'Pronounce every written word, including narration that describes laughter, crying, sighing, or other actions.',
    'Do not replace any written word or phrase with laughter, crying, a sigh, or any other non-verbal sound effect.',
    context.speed === undefined
      ? 'Articulate clearly with distinct word boundaries; do not use unnatural mora-by-mora pronunciation.'
      : `Articulate clearly with distinct word boundaries at a speed of ${String(context.speed)}× normal; do not use unnatural mora-by-mora pronunciation.`,
    'Pause briefly at natural phrase boundaries, and keep standard pitch accent and rhythm intact.',
  ];

  if (style === 'prefix') {
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
