import type { StoryForm } from '../reading/reading';
import type { RandomSource } from '../shared/random';
import type { VocabularyItemId } from '../shared/ids';
import {
  FSRS_DIFFICULTY_MAXIMUM,
  FSRS_DIFFICULTY_MINIMUM,
  type AnkiSchedulingSignals,
} from '../anki/scheduling-signals';
import type { AnkiWordPriorityMode } from '../settings/settings';

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

/** Days after which a word counts as half as recently learned. */
export const RECENCY_HALF_LIFE_DAYS = 120;

/** Interval beyond which a word is simply long known and ranks no lower. */
export const ESTABLISHED_INTERVAL_DAYS = 180;

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

const MILLISECONDS_PER_DAY = 86_400_000;

/** One item and the optional Anki scheduling state used to weight it. */
export interface PaletteCandidate extends AnkiSchedulingSignals {
  readonly id: VocabularyItemId;
}

/**
 * Samples a palette with a partial Fisher-Yates shuffle.
 *
 * Only the first `size` positions are resolved, so a 1,800-entry snapshot costs
 * at most 180 swaps rather than 1,800. The input is never mutated, and the
 * randomness comes from an injected source so a test can drive an exact
 * selection.
 */
export function samplePalette(
  itemIds: readonly VocabularyItemId[],
  size: number,
  random: RandomSource,
): readonly VocabularyItemId[] {
  const wanted = Math.max(0, Math.min(Math.trunc(size), itemIds.length));
  if (wanted === 0) {
    return [];
  }

  const pool = [...itemIds];
  for (let index = 0; index < wanted; index += 1) {
    const pick = index + random.nextInt(pool.length - index);
    const swapped = pool[pick];
    pool[pick] = pool[index];
    pool[index] = swapped;
  }
  return pool.slice(0, wanted);
}

/**
 * Scores how recently the learner met a word, from 0 to 1.
 *
 * The first review answers the question directly. The interval is a usable
 * stand-in where no review log exists — a word still being learned is scheduled
 * days out, one long known is scheduled months out — but it is weaker, because a
 * mature word that lapsed also drops to a short interval.
 *
 * Review count is deliberately not a fallback. Under modern scheduling a settled
 * word accrues few repetitions over years while a fresh one accrues many in a
 * week, so it measures difficulty rather than recency, and using it made this
 * mode indistinguishable from chance.
 */
function recencyScore(candidate: AnkiSchedulingSignals, now: number): number {
  if (Number.isFinite(candidate.firstReviewedAt) && Number.isFinite(now)) {
    const ageDays = Math.max(0, (now - (candidate.firstReviewedAt ?? 0)) / MILLISECONDS_PER_DAY);
    // Half-life decay rather than age measured against some maximum: any maximum
    // is either arbitrary or drawn from the collection, and a collection-derived
    // one would let a single ancient card rescale every other word.
    return clamp(Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS), 0, 1);
  }
  if (Number.isFinite(candidate.intervalDays)) {
    // Logarithmic, because intervals roughly double as retention grows, so the
    // step from two days to four says far more than a month to a month and a day.
    const established =
      Math.log2(Math.max(candidate.intervalDays ?? 1, 1)) / Math.log2(ESTABLISHED_INTERVAL_DAYS);
    return clamp(1 - established, 0, 1);
  }
  return NEUTRAL_SCORE;
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
 * Each mode reduces its evidence to a score between 0 and 1, and one shared
 * curve maps that onto a weight, so the shape of a mode's judgement lives with
 * the evidence instead of being spread across two places.
 *
 * The scoring functions stay defensive about their inputs because snapshots from
 * older installs and test doubles can carry absent or invalid optional fields.
 */
export function priorityWeight(
  mode: AnkiWordPriorityMode,
  candidate: AnkiSchedulingSignals,
  now: number,
): number {
  if (mode === 'uniform') {
    return PALETTE_BASELINE_WEIGHT;
  }
  const score = mode === 'recent' ? recencyScore(candidate, now) : difficultyScore(candidate);
  return weightForScore(score);
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
  mode: AnkiWordPriorityMode,
  random: RandomSource,
  now: number,
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
    weight: priorityWeight(mode, candidate, now),
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
