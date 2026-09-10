import type { StoryForm } from '../reading/reading';
import { sampleWithoutReplacement, type RandomSource } from '../shared/random';
import type { VocabularyItemId } from '../shared/ids';
import {
  FSRS_DIFFICULTY_MAXIMUM,
  FSRS_DIFFICULTY_MINIMUM,
  type AnkiSchedulingSignals,
} from '../anki/scheduling-signals';

/**
 * How many reviewed items are sampled as inspiration for one story.
 *
 * The palette exists so two stories generated from the same snapshot and the
 * same premise do not converge on the same handful of words. It is never a
 * target list: the complete snapshot remains the allowlist and the local
 * validation authority, and nothing sampled here is shown to the learner.
 */
export const PALETTE_SIZES: Readonly<Record<StoryForm, number>> = {
  micro: 40,
  short: 100,
  medium: 140,
  long: 180,
};

/** The weight every candidate carries before a mode has anything to say. */
export const PALETTE_BASELINE_WEIGHT = 1_000;

/**
 * How much heavier the strongest candidate is than the weakest.
 *
 * The previous four-fold spread was invisible in practice: across a snapshot of
 * several hundred words it shifted the expected palette by a fraction of a word,
 * so a learner who chose a mode saw nothing change. This is wide enough that the
 * mode is unmistakable and narrow enough that the rest of the snapshot still
 * appears, which matters because two stories from one snapshot should not read
 * as the same story.
 */
export const PALETTE_MAX_TILT = 16;

/**
 * How the palette is weighted.
 *
 * Recently learned is absent: it chooses an ordered focus list instead
 * (ADR 0067) and samples its palette uniformly from the remaining words.
 */
export type PaletteWeighting = 'uniform' | 'difficult';

/**
 * The score given when a mode has no evidence about a word at all.
 *
 * The midpoint, deliberately: neither the head of the palette nor the tail. It
 * makes a snapshot carrying no scheduling state behave exactly like Uniform —
 * every candidate scores the same, and sampling without replacement over equal
 * weights is a uniform sample — which is the honest answer for a snapshot taken
 * before these signals existed, or from a source that cannot prove them.
 */
const NEUTRAL_SCORE = 0.5;

/**
 * How much of the full range the lapse-and-ease estimate may use.
 *
 * That estimate cannot tell "easy" from "unknown": a card with no lapses and a
 * default ease scores zero whether it is genuinely easy or simply has no
 * evidence either way. Under FSRS it is worse, because `factor` stops being
 * maintained and freezes at whatever SM-2 last wrote. Giving it half the swing
 * around neutral keeps it monotone and useful while preventing the absurdity of
 * a word with no signals at all outranking one we know something about.
 */
const SM2_ESTIMATE_CONFIDENCE = 0.5;

/** One item and the optional Anki scheduling state used to weight it. */
export interface PaletteCandidate extends AnkiSchedulingSignals {
  readonly id: VocabularyItemId;
}

/** Samples a palette uniformly without replacement. */
export function samplePalette(
  itemIds: readonly VocabularyItemId[],
  size: number,
  random: RandomSource,
): readonly VocabularyItemId[] {
  return sampleWithoutReplacement(itemIds, size, random);
}

/** Scores how hard the learner finds a word, from 0 to 1. */
function difficultyScore(candidate: AnkiSchedulingSignals): number {
  if (candidate.fsrsDifficulty !== undefined) {
    return clamp(
      (candidate.fsrsDifficulty - FSRS_DIFFICULTY_MINIMUM) /
        (FSRS_DIFFICULTY_MAXIMUM - FSRS_DIFFICULTY_MINIMUM),
      0,
      1,
    );
  }
  if (candidate.lapseRatio === undefined && candidate.easeFactor === undefined) {
    return NEUTRAL_SCORE;
  }
  const lapseRatio = Number.isFinite(candidate.lapseRatio)
    ? clamp(candidate.lapseRatio ?? 0, 0, 1)
    : 0;
  const blended = 0.75 * lapseRatio + 0.25 * easePenalty(candidate.easeFactor);
  return NEUTRAL_SCORE + SM2_ESTIMATE_CONFIDENCE * (blended - NEUTRAL_SCORE);
}

/**
 * Computes the integer weight for one palette candidate.
 *
 * The mode reduces its evidence to a score between 0 and 1, and one shared
 * curve maps that onto a weight, so the shape of its judgement lives with the
 * evidence instead of being spread across two places.
 *
 * The scoring stays defensive about its inputs because snapshots from older
 * installs and test doubles can carry absent or invalid optional fields.
 */
export function priorityWeight(mode: PaletteWeighting, candidate: AnkiSchedulingSignals): number {
  if (mode === 'uniform') {
    return PALETTE_BASELINE_WEIGHT;
  }
  return weightForScore(difficultyScore(candidate));
}

/** Maps a 0-to-1 score onto the weight range every mode shares. */
export function weightForScore(score: number): number {
  return Math.round(PALETTE_BASELINE_WEIGHT * (1 + (PALETTE_MAX_TILT - 1) * clamp(score, 0, 1)));
}

/** Ease-factor penalty used by Difficult mode. Missing and zero ease are neutral. */
export function easePenalty(factor: number | undefined): number {
  if (factor === undefined || !Number.isFinite(factor) || factor <= 0) {
    return 0;
  }
  return clamp((2_500 - factor) / 1_200, 0, 1);
}

/**
 * Samples weighted candidates without replacement.
 *
 * Uniform mode delegates to the plain sampler so its established sequence stays
 * byte-for-byte compatible with existing runs and tests.
 *
 * A floor-weight word is rare in the result but never unreachable, which is the
 * intent: the palette is only inspiration, and the complete snapshot remains the
 * allowlist and the validation authority, so a thin tail costs variety between
 * runs rather than correctness.
 */
export function sampleWeightedPalette(
  candidates: readonly PaletteCandidate[],
  size: number,
  mode: PaletteWeighting,
  random: RandomSource,
): readonly VocabularyItemId[] {
  const uniqueCandidates = deduplicateCandidates(candidates);
  const wanted = Math.max(0, Math.min(Math.trunc(size), uniqueCandidates.length));
  if (wanted === 0) {
    return [];
  }
  if (mode === 'uniform') {
    return samplePalette(
      uniqueCandidates.map((candidate) => candidate.id),
      wanted,
      random,
    );
  }

  // Weighed once: a candidate's weight cannot change as the pool shrinks, so
  // recomputing every weight on every draw was work with no effect on the result.
  const pool = uniqueCandidates.map((candidate) => ({
    id: candidate.id,
    weight: priorityWeight(mode, candidate),
  }));
  const sampled: VocabularyItemId[] = [];
  for (let draw = 0; draw < wanted; draw += 1) {
    const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
    let ticket = random.nextInt(total);
    // RandomSource's contract guarantees the range. Clamping here keeps a
    // malformed test double from producing a duplicate or an undefined id.
    ticket = Math.max(0, Math.min(total - 1, Math.trunc(ticket)));
    let cursor = 0;
    let selectedIndex = pool.length - 1;
    for (let index = 0; index < pool.length; index += 1) {
      cursor += pool[index].weight;
      if (ticket < cursor) {
        selectedIndex = index;
        break;
      }
    }
    sampled.push(pool[selectedIndex].id);
    pool.splice(selectedIndex, 1);
  }
  return sampled;
}

/** The palette size for a form, capped by what the snapshot actually holds. */
export function paletteSizeFor(form: StoryForm, snapshotSize: number): number {
  return Math.min(PALETTE_SIZES[form], snapshotSize);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function deduplicateCandidates(
  candidates: readonly PaletteCandidate[],
): readonly PaletteCandidate[] {
  const seen = new Set<VocabularyItemId>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.id)) {
      return false;
    }
    seen.add(candidate.id);
    return true;
  });
}
