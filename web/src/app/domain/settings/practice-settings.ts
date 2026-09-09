import { PRACTICE_WINDOWS, type PracticeWindowDays } from '../anki/practice-evidence';
import type { AnkiWordPriorityMode } from './settings';

/**
 * What the learner wants a story built around.
 *
 * These are four different questions, not four points on one scale, which is
 * why they are named rather than mixed. `daily` asks for both halves of the
 * ordinary journey; `recent` and `difficult` ask for one of them; `free` asks
 * for none and leaves reading to the whole vocabulary, which stays the
 * allowlist under every mode.
 */
export type PracticeMode = 'daily' | 'recent' | 'difficult' | 'free';

export const PRACTICE_MODES: readonly PracticeMode[] = ['daily', 'recent', 'difficult', 'free'];

export interface PracticeSettings {
  readonly mode: PracticeMode;
  /**
   * How far back the recent-practice question reaches, in study days.
   *
   * Kept for `difficult` and `free` too. A learner who switches to Difficult
   * and back should find the period they chose, and storing it costs a number.
   */
  readonly windowDays: PracticeWindowDays;
}

export const DEFAULT_PRACTICE_SETTINGS: PracticeSettings = {
  mode: 'daily',
  windowDays: 3,
};

export function isPracticeMode(value: unknown): value is PracticeMode {
  return PRACTICE_MODES.includes(value as PracticeMode);
}

export function isPracticeWindowDays(value: unknown): value is PracticeWindowDays {
  return PRACTICE_WINDOWS.includes(value as PracticeWindowDays);
}

/**
 * Reads an installation's old palette-weighting choice as a practice mode.
 *
 * `uniform` becomes `free` because that is what it did: no preference, the
 * whole vocabulary. `recent` and `difficult` keep their names because the
 * learner asked for those words and will now actually get them, rather than a
 * palette tilted towards them. Nothing here can be inferred as `daily`, so a
 * learner who had expressed a preference keeps it and only a genuinely new
 * installation gets the new default.
 */
export function practiceModeFromWordPriority(mode: AnkiWordPriorityMode): PracticeMode {
  switch (mode) {
    case 'uniform':
      return 'free';
    case 'recent':
      return 'recent';
    case 'difficult':
      return 'difficult';
  }
}
