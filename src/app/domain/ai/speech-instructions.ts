export type SpeechInstructionsSupport = 'supported' | 'unsupported';

/** Bumped whenever the learner-facing delivery instruction changes. */
export const SPEECH_INSTRUCTION_VERSION = 'speech/3';

/** Neighbor text is context, not another unbounded prompt input. */
export const MAX_SPEECH_CONTEXT_CODE_POINTS = 200;

export interface SpeechContext {
  readonly beforeJa?: string;
  readonly afterJa?: string;
  /**
   * The speed actually being requested, when one is.
   *
   * `speed` is a separate API parameter that is dropped for models that do not
   * support it and after a capability refusal, so an instruction that names
   * "the requested speed" unconditionally would sometimes refer to nothing.
   */
  readonly speed?: number;
}

/**
 * Keeps the spoken input exact while giving capable speech models just enough
 * context to choose natural pauses, emotion, pitch, and final intonation.
 */
export function buildSpeechInstructions(context: SpeechContext = {}): string {
  const before = capCodePoints(context.beforeJa);
  const after = capCodePoints(context.afterJa);
  const contextLines = [
    before === undefined ? null : `Previous sentence (context only): ${JSON.stringify(before)}`,
    after === undefined ? null : `Next sentence (context only): ${JSON.stringify(after)}`,
  ].filter((line): line is string => line !== null);

  return [
    'Speak only the exact target text in natural standard Japanese.',
    'Pronounce every written word, including narration that describes laughter, crying, sighing, or other actions.',
    'Do not replace any written word or phrase with laughter, crying, a sigh, or any other non-verbal sound effect.',
    context.speed === undefined
      ? 'Articulate clearly; do not use unnatural mora-by-mora pronunciation.'
      : `Articulate clearly at a speed of ${String(context.speed)}× normal; do not use unnatural mora-by-mora pronunciation.`,
    'Use any adjacent sentences only to infer emotion, pauses, pitch, and sentence-final intonation.',
    'Never add, repeat, translate, spell out, or speak the context.',
    ...contextLines,
  ].join('\n');
}

function capCodePoints(value: string | undefined): string | undefined {
  if (value === undefined || value.trim() === '') {
    return undefined;
  }
  return Array.from(value).slice(0, MAX_SPEECH_CONTEXT_CODE_POINTS).join('');
}
