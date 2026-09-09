import { describe, expect, it } from 'vitest';
import {
  isEligibleReviewedCard,
  difficultyPercent,
  mergeSchedulingSignals,
  normalizeSchedulingSignals,
  schedulingSignalsFromCard,
} from './scheduling-signals';

describe('difficultyPercent', () => {
  it('maps and clamps the FSRS scale', () => {
    expect(difficultyPercent(1)).toBe(0);
    expect(difficultyPercent(10)).toBe(100);
    expect(difficultyPercent(5.5)).toBe(50);
    expect(difficultyPercent(-2)).toBe(0);
    expect(difficultyPercent(22)).toBe(100);
    expect(difficultyPercent(undefined)).toBeNull();
  });
});

describe('normalizeSchedulingSignals', () => {
  it('keeps signals that are within range', () => {
    expect(
      normalizeSchedulingSignals({
        reps: 4,
        lapseRatio: 0.25,
        easeFactor: 2_100,
        firstReviewedAt: 1_760_000_000_000,
        intervalDays: 12.5,
        fsrsDifficulty: 8.269,
      }),
    ).toEqual({
      reps: 4,
      lapseRatio: 0.25,
      easeFactor: 2_100,
      firstReviewedAt: 1_760_000_000_000,
      intervalDays: 12.5,
      fsrsDifficulty: 8.269,
    });
  });

  it('drops absent input entirely', () => {
    expect(normalizeSchedulingSignals(undefined)).toEqual({});
    expect(normalizeSchedulingSignals(null)).toEqual({});
    expect(normalizeSchedulingSignals({})).toEqual({});
  });

  it('rejects rather than clamps an out-of-range value', () => {
    // A clamped value would enter the palette as a confident score the evidence
    // never supported. Dropping it lets the mode fall back to weaker evidence.
    for (const firstReviewedAt of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(normalizeSchedulingSignals({ firstReviewedAt })).toEqual({});
    }
    for (const intervalDays of [0, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(normalizeSchedulingSignals({ intervalDays })).toEqual({});
    }
    for (const fsrsDifficulty of [0, 0.5, 10.5, 11, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(normalizeSchedulingSignals({ fsrsDifficulty })).toEqual({});
    }
  });

  it('accepts the exact bounds of the FSRS difficulty scale', () => {
    expect(normalizeSchedulingSignals({ fsrsDifficulty: 1 })).toEqual({ fsrsDifficulty: 1 });
    expect(normalizeSchedulingSignals({ fsrsDifficulty: 10 })).toEqual({ fsrsDifficulty: 10 });
  });
});

describe('mergeSchedulingSignals', () => {
  it('applies the priority rule for each signal', () => {
    const merged = mergeSchedulingSignals(
      {
        reps: 8,
        lapseRatio: 0.1,
        easeFactor: 2_400,
        firstReviewedAt: 1_700_000_000_000,
        intervalDays: 40,
        fsrsDifficulty: 3,
      },
      {
        reps: 2,
        lapseRatio: 0.6,
        easeFactor: 1_700,
        firstReviewedAt: 1_760_000_000_000,
        intervalDays: 1,
        fsrsDifficulty: 9,
      },
    );

    expect(merged).toEqual({
      reps: 2,
      lapseRatio: 0.6,
      easeFactor: 1_700,
      // Earliest evidence: the note was learned when its first card was first
      // answered, so a late-added sibling cannot make it look freshly learned.
      firstReviewedAt: 1_700_000_000_000,
      // Largest interval: a sibling in relearning must not present a
      // long-settled note as new.
      intervalDays: 40,
      fsrsDifficulty: 9,
    });
  });

  it('carries a one-sided signal through unchanged', () => {
    expect(mergeSchedulingSignals({ firstReviewedAt: 1_700_000_000_000 }, { reps: 3 })).toEqual({
      reps: 3,
      firstReviewedAt: 1_700_000_000_000,
    });
    expect(mergeSchedulingSignals(undefined, { intervalDays: 9 })).toEqual({ intervalDays: 9 });
    expect(mergeSchedulingSignals({ fsrsDifficulty: 7 }, null)).toEqual({ fsrsDifficulty: 7 });
  });

  it('drops an invalid value instead of letting it win the comparison', () => {
    expect(mergeSchedulingSignals({ fsrsDifficulty: 99 }, { fsrsDifficulty: 4 })).toEqual({
      fsrsDifficulty: 4,
    });
  });
});

describe('schedulingSignalsFromCard', () => {
  it('derives the lapse ratio from the card', () => {
    expect(schedulingSignalsFromCard({ reps: 4, lapses: 1, factor: 2_300 })).toEqual({
      reps: 4,
      lapseRatio: 0.25,
      easeFactor: 2_300,
    });
  });

  it('reads a learning card as at most a day out', () => {
    // Anki stores a learning card's interval as negative seconds. Resolving it
    // per card is what makes merging by maximum compare like with like.
    expect(schedulingSignalsFromCard({ reps: 1, intervalDays: -600 })).toEqual({
      reps: 1,
      intervalDays: 1,
    });
    expect(schedulingSignalsFromCard({ reps: 1, intervalDays: 0 })).toEqual({
      reps: 1,
      intervalDays: 1,
    });
  });

  it('carries the first review and FSRS difficulty through', () => {
    expect(
      schedulingSignalsFromCard({
        reps: 6,
        firstReviewedAt: 1_760_000_000_000,
        intervalDays: 23,
        fsrsDifficulty: 8.269,
      }),
    ).toEqual({
      reps: 6,
      firstReviewedAt: 1_760_000_000_000,
      intervalDays: 23,
      fsrsDifficulty: 8.269,
    });
  });

  it('omits columns the source could not provide', () => {
    expect(schedulingSignalsFromCard({ reps: 3 })).toEqual({ reps: 3 });
  });
});

describe('isEligibleReviewedCard', () => {
  it('requires review evidence and rejects an explicitly suspended card', () => {
    expect(isEligibleReviewedCard(1, 2)).toBe(true);
    expect(isEligibleReviewedCard(0, 2)).toBe(false);
    expect(isEligibleReviewedCard(3, -1)).toBe(false);
  });
});
