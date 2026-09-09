/**
 * The small part of Anki scheduling state that can influence a suggestion
 * palette.  These values are deliberately optional: older package exports and
 * limited Anki bridges can prove review evidence without carrying every
 * scheduling column.
 */
export interface AnkiSchedulingSignals {
  /** Minimum positive `reps` observed for the note's eligible cards. */
  readonly reps?: number;
  /** Maximum `lapses / reps` ratio observed for the note's eligible cards. */
  readonly lapseRatio?: number;
  /** Minimum non-zero ease factor observed for the note's eligible cards. */
  readonly easeFactor?: number;
  /**
   * Earliest real review of any eligible card, in epoch milliseconds.
   *
   * This is when the learner actually met the word, which is what "recently
   * learned" means. It is not when the note was added: a premade deck adds
   * thousands of notes at one instant and the learner meets them over years.
   */
  readonly firstReviewedAt?: number;
  /** Largest current scheduling interval, in days, over the eligible cards. */
  readonly intervalDays?: number;
  /** Largest FSRS difficulty, on Anki's 1-10 scale, over the eligible cards. */
  readonly fsrsDifficulty?: number;
  /**
   * Latest real answer to any eligible card, in epoch milliseconds.
   *
   * Supplemental to the answered-within pools, never a substitute for them: it
   * says when a card was last answered, which a source may know exactly, may
   * know not at all, and which says nothing about a sibling that was not. Pool
   * membership is what the recent-practice windows are decided from.
   */
  readonly lastReviewedAt?: number;
}

/** Bounds of Anki's FSRS difficulty scale, used to reject implausible values. */
export const FSRS_DIFFICULTY_MINIMUM = 1;
export const FSRS_DIFFICULTY_MAXIMUM = 10;

/** One eligible card's raw scheduling columns, before normalization. */
export interface AnkiCardScheduling {
  readonly reps: number;
  readonly lapses?: number;
  readonly factor?: number;
  readonly firstReviewedAt?: number;
  /** Anki's `ivl`: positive days, or negative seconds while a card is learning. */
  readonly intervalDays?: number;
  readonly fsrsDifficulty?: number;
  readonly lastReviewedAt?: number;
}

/** Anki's queue code for a card the learner explicitly suspended. */
export const SUSPENDED_QUEUE = -1;

/**
 * Decides whether one card makes its note part of the learner's vocabulary.
 *
 * A repetition proves that the learner has encountered the card. Suspension is
 * an explicit exception: it removes that card from Monosai's vocabulary even
 * though Anki preserves its review history. Other queue states, including
 * temporary burying and relearning, do not change that evidence.
 */
export function isEligibleReviewedCard(reps: number, queue: number): boolean {
  return Number.isInteger(reps) && reps > 0 && queue !== SUSPENDED_QUEUE;
}

/** Keeps provider output finite and in the normalized shape persisted by the app. */
export function normalizeSchedulingSignals(
  signals: Partial<AnkiSchedulingSignals> | null | undefined,
): AnkiSchedulingSignals {
  const reps = positiveInteger(signals?.reps);
  const lapseRatio = unitInterval(signals?.lapseRatio);
  const easeFactor = positiveFinite(signals?.easeFactor);
  const firstReviewedAt = positiveInteger(signals?.firstReviewedAt);
  const intervalDays = positiveFinite(signals?.intervalDays);
  const fsrsDifficulty = withinRange(
    signals?.fsrsDifficulty,
    FSRS_DIFFICULTY_MINIMUM,
    FSRS_DIFFICULTY_MAXIMUM,
  );
  const lastReviewedAt = positiveInteger(signals?.lastReviewedAt);
  return {
    ...(reps === undefined ? {} : { reps }),
    ...(lapseRatio === undefined ? {} : { lapseRatio }),
    ...(easeFactor === undefined ? {} : { easeFactor }),
    ...(firstReviewedAt === undefined ? {} : { firstReviewedAt }),
    ...(intervalDays === undefined ? {} : { intervalDays }),
    ...(fsrsDifficulty === undefined ? {} : { fsrsDifficulty }),
    ...(lastReviewedAt === undefined ? {} : { lastReviewedAt }),
  };
}

/** Merges duplicate notes/items using the priority rule for each signal. */
export function mergeSchedulingSignals(
  left: AnkiSchedulingSignals | null | undefined,
  right: AnkiSchedulingSignals | null | undefined,
): AnkiSchedulingSignals {
  const a = normalizeSchedulingSignals(left);
  const b = normalizeSchedulingSignals(right);
  const reps = minimumDefined(a.reps, b.reps);
  const lapseRatio = maximumDefined(a.lapseRatio, b.lapseRatio);
  const easeFactor = minimumDefined(a.easeFactor, b.easeFactor);
  // Earliest first review: the note entered the vocabulary when its first card
  // was first answered, and the earliest evidence is also the pessimistic one,
  // so a late-added sibling never makes a long-known note look freshly learned.
  const firstReviewedAt = minimumDefined(a.firstReviewedAt, b.firstReviewedAt);
  // Largest interval: a note is as settled as its best-established card. Taking
  // the minimum would let one sibling in relearning, whose interval resets to a
  // day, present a long-known note as new.
  const intervalDays = maximumDefined(a.intervalDays, b.intervalDays);
  const fsrsDifficulty = maximumDefined(a.fsrsDifficulty, b.fsrsDifficulty);
  // Latest last review: the note was practised when its most recently answered
  // card was answered. The earliest would date the note to a sibling the learner
  // has not seen in a year and call a word studied today long forgotten.
  const lastReviewedAt = maximumDefined(a.lastReviewedAt, b.lastReviewedAt);
  return {
    ...(reps === undefined ? {} : { reps }),
    ...(lapseRatio === undefined ? {} : { lapseRatio }),
    ...(easeFactor === undefined ? {} : { easeFactor }),
    ...(firstReviewedAt === undefined ? {} : { firstReviewedAt }),
    ...(intervalDays === undefined ? {} : { intervalDays }),
    ...(fsrsDifficulty === undefined ? {} : { fsrsDifficulty }),
    ...(lastReviewedAt === undefined ? {} : { lastReviewedAt }),
  };
}

/**
 * Turns one eligible card's optional columns into normalized note signals.
 *
 * The interval is resolved here rather than during the merge because Anki
 * stores a learning card's interval as negative seconds. Reading that as "at
 * most a day out" per card is what makes merging by maximum correct: the
 * comparison then happens between values that all mean the same thing.
 */
export function schedulingSignalsFromCard(card: AnkiCardScheduling): AnkiSchedulingSignals {
  const { reps, lapses, factor, firstReviewedAt, intervalDays, fsrsDifficulty, lastReviewedAt } =
    card;
  return normalizeSchedulingSignals({
    reps,
    lapseRatio:
      Number.isFinite(lapses) && (lapses ?? 0) >= 0 && reps > 0 ? (lapses ?? 0) / reps : undefined,
    easeFactor: factor,
    firstReviewedAt,
    intervalDays:
      intervalDays === undefined || !Number.isFinite(intervalDays)
        ? undefined
        : Math.max(intervalDays, 1),
    fsrsDifficulty,
    lastReviewedAt,
  });
}

function positiveInteger(value: number | undefined): number | undefined {
  return Number.isInteger(value) && (value ?? 0) > 0 ? value : undefined;
}

function positiveFinite(value: number | undefined): number | undefined {
  return Number.isFinite(value) && (value ?? 0) > 0 ? value : undefined;
}

function unitInterval(value: number | undefined): number | undefined {
  return withinRange(value, 0, 1);
}

/**
 * Rejects rather than clamps an out-of-range value.
 *
 * A clamped value would enter the palette as a confident score the evidence
 * never supported; dropping it lets the mode fall back to weaker evidence, or
 * to neutral, which is the honest answer when a provider sends nonsense.
 */
function withinRange(
  value: number | undefined,
  minimum: number,
  maximum: number,
): number | undefined {
  return Number.isFinite(value) && (value ?? 0) >= minimum && (value ?? 0) <= maximum
    ? value
    : undefined;
}

function minimumDefined(left: number | undefined, right: number | undefined): number | undefined {
  if (left === undefined) {
    return right;
  }
  if (right === undefined) {
    return left;
  }
  return Math.min(left, right);
}

function maximumDefined(left: number | undefined, right: number | undefined): number | undefined {
  if (left === undefined) {
    return right;
  }
  if (right === undefined) {
    return left;
  }
  return Math.max(left, right);
}
