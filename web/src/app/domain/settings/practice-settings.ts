import type { PracticeWindowDays } from '../anki/practice-evidence';

/**
 * What the learner wants a story built around.
 *
 * Four different questions, not four points on one scale, which is why they are
 * named rather than mixed. `daily` asks for both halves of the ordinary
 * journey; `recent` and `difficult` ask for one of them; `free` asks for none
 * and leaves reading to the whole vocabulary, which stays the allowlist under
 * every mode.
 */
export type PracticeMode = 'daily' | 'recent' | 'difficult' | 'free';

export interface PracticeSettings {
  readonly mode: PracticeMode;
  /**
   * How far back the recent-practice question reaches, in study days.
   *
   * Kept under `difficult` and `free` too. A learner who looks at difficult
   * words and comes back should find the period they chose, and remembering it
   * costs a number.
   */
  readonly windowDays: PracticeWindowDays;
}

export const DEFAULT_PRACTICE_SETTINGS: PracticeSettings = {
  mode: 'daily',
  windowDays: 3,
};
