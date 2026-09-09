import { describe, expect, it } from 'vitest';
import { vocabularyItemId, type VocabularyItemId } from '../shared/ids';
import type { RandomSource } from '../shared/random';
import {
  ESTABLISHED_INTERVAL_DAYS,
  PALETTE_BASELINE_WEIGHT,
  PALETTE_SIZES,
  RECENCY_HALF_LIFE_DAYS,
  paletteSizeFor,
  priorityWeight,
  samplePalette,
  sampleWeightedPalette,
  weightForScore,
} from './suggestion-palette';

function ids(count: number): readonly VocabularyItemId[] {
  return Array.from({ length: count }, (_value, index) => vocabularyItemId(`v${String(index)}`));
}

/** Always picks the first remaining item, so the selection is exactly the head. */
const firstAlways: RandomSource = { nextInt: () => 0 };

/** Always picks the last remaining item, which pulls the tail forward. */
const lastAlways: RandomSource = { nextInt: (exclusiveMax) => exclusiveMax - 1 };

const NOW = 1_780_000_000_000;
const DAY = 86_400_000;

/** Named so cases read as intent rather than as arithmetic. */
const FLOOR = weightForScore(0);
const NEUTRAL = weightForScore(0.5);
const CEILING = weightForScore(1);

describe('samplePalette', () => {
  it('uses the injected randomness rather than a hidden source', () => {
    expect(samplePalette(ids(5), 3, firstAlways)).toEqual([
      vocabularyItemId('v0'),
      vocabularyItemId('v1'),
      vocabularyItemId('v2'),
    ]);
    expect(samplePalette(ids(5), 3, lastAlways)).toEqual([
      vocabularyItemId('v4'),
      vocabularyItemId('v0'),
      vocabularyItemId('v1'),
    ]);
  });

  it('never repeats an item', () => {
    const sampled = samplePalette(ids(40), 25, {
      nextInt: (exclusiveMax) => (exclusiveMax * 7) % exclusiveMax,
    });

    expect(new Set(sampled).size).toBe(sampled.length);
  });

  it('caps at the snapshot size instead of padding', () => {
    expect(samplePalette(ids(3), 40, firstAlways)).toHaveLength(3);
  });

  it('returns nothing for an empty snapshot or a zero size', () => {
    expect(samplePalette([], 40, firstAlways)).toEqual([]);
    expect(samplePalette(ids(5), 0, firstAlways)).toEqual([]);
  });

  it('leaves the caller list untouched', () => {
    const source = ids(6);
    const copy = [...source];

    samplePalette(source, 4, lastAlways);

    expect(source).toEqual(copy);
  });
});

describe('paletteSizeFor', () => {
  it('uses the specified sizes, capped by the snapshot', () => {
    expect(PALETTE_SIZES).toEqual({ micro: 40, short: 100, medium: 140, long: 180 });
    expect(paletteSizeFor('micro', 1_800)).toBe(40);
    expect(paletteSizeFor('short', 1_800)).toBe(100);
    expect(paletteSizeFor('medium', 1_800)).toBe(140);
    expect(paletteSizeFor('long', 1_800)).toBe(180);
    expect(paletteSizeFor('short', 60)).toBe(60);
  });
});

describe('priorityWeight', () => {
  it('uses the neutral baseline for uniform, whatever the signals say', () => {
    expect(priorityWeight('uniform', { reps: 1, lapseRatio: 1, easeFactor: 100 }, NOW)).toBe(
      PALETTE_BASELINE_WEIGHT,
    );
  });

  it('places a word with no evidence at the midpoint of the scale', () => {
    // Neither the head of the palette nor the tail: with nothing to go on every
    // candidate ties, so the mode degrades to Uniform rather than to noise.
    expect(priorityWeight('recent', {}, NOW)).toBe(NEUTRAL);
    expect(priorityWeight('difficult', {}, NOW)).toBe(NEUTRAL);
  });

  it('does not read a review count as evidence of recency', () => {
    // The defect this replaces. A settled word accrues few repetitions over
    // years while a fresh one accrues many in a week, so the count says nothing
    // about when the learner met the word.
    expect(priorityWeight('recent', { reps: 1 }, NOW)).toBe(NEUTRAL);
    expect(priorityWeight('recent', { reps: 40 }, NOW)).toBe(NEUTRAL);
  });

  describe('recent', () => {
    it('decays by half-life from the first review', () => {
      expect(priorityWeight('recent', { firstReviewedAt: NOW }, NOW)).toBe(CEILING);
      expect(
        priorityWeight('recent', { firstReviewedAt: NOW - RECENCY_HALF_LIFE_DAYS * DAY }, NOW),
      ).toBe(NEUTRAL);
      expect(
        priorityWeight('recent', { firstReviewedAt: NOW - 2 * RECENCY_HALF_LIFE_DAYS * DAY }, NOW),
      ).toBe(weightForScore(0.25));
    });

    it('never exceeds the ceiling for a review dated in the future', () => {
      expect(priorityWeight('recent', { firstReviewedAt: NOW + 30 * DAY }, NOW)).toBe(CEILING);
    });

    it('separates a word learned last month from one learned last year', () => {
      // Review count put an eleven-month-old word and last month's within a few
      // per cent of each other, which is why the mode did nothing.
      const fresh = priorityWeight('recent', { firstReviewedAt: NOW - 30 * DAY }, NOW);
      const old = priorityWeight('recent', { firstReviewedAt: NOW - 365 * DAY }, NOW);

      expect(fresh / old).toBeGreaterThan(4);
    });

    it('falls back to the interval, on a log scale with a ceiling', () => {
      expect(priorityWeight('recent', { intervalDays: 1 }, NOW)).toBe(CEILING);
      expect(priorityWeight('recent', { intervalDays: ESTABLISHED_INTERVAL_DAYS }, NOW)).toBe(
        FLOOR,
      );
      expect(priorityWeight('recent', { intervalDays: 365 }, NOW)).toBe(FLOOR);
      expect(priorityWeight('recent', { intervalDays: 6 }, NOW)).toBeGreaterThan(
        priorityWeight('recent', { intervalDays: 23 }, NOW),
      );
    });

    it('prefers the first review over the interval when both are known', () => {
      // A mature word that lapsed drops to a short interval; the date does not.
      expect(
        priorityWeight('recent', { firstReviewedAt: NOW - 730 * DAY, intervalDays: 1 }, NOW),
      ).toBeLessThan(NEUTRAL);
    });
  });

  describe('difficult', () => {
    it('maps FSRS difficulty across the whole scale', () => {
      expect(priorityWeight('difficult', { fsrsDifficulty: 1 }, NOW)).toBe(FLOOR);
      expect(priorityWeight('difficult', { fsrsDifficulty: 5.5 }, NOW)).toBe(NEUTRAL);
      expect(priorityWeight('difficult', { fsrsDifficulty: 10 }, NOW)).toBe(CEILING);
    });

    it('prefers FSRS difficulty over stale lapse and ease evidence', () => {
      // Under FSRS the ease factor freezes at whatever SM-2 last wrote, so the
      // older evidence must not dilute the estimate that is actually maintained.
      expect(
        priorityWeight('difficult', { fsrsDifficulty: 9, lapseRatio: 0, easeFactor: 2_500 }, NOW),
      ).toBe(priorityWeight('difficult', { fsrsDifficulty: 9 }, NOW));
    });

    it('keeps the lapse and ease estimate inside a band around neutral', () => {
      const hardest = priorityWeight('difficult', { lapseRatio: 1, easeFactor: 1_200 }, NOW);
      const easiest = priorityWeight('difficult', { lapseRatio: 0, easeFactor: 2_500 }, NOW);

      // No lapses and a default ease mean "no evidence", not "easy". Given the
      // full range, such a word would sit below one carrying no signals at all,
      // so less information would outrank more.
      expect(easiest).toBeGreaterThan(FLOOR);
      expect(easiest).toBeLessThan(NEUTRAL);
      expect(hardest).toBeGreaterThan(NEUTRAL);
      expect(hardest).toBeLessThan(CEILING);
    });

    it('ignores values outside the ranges Anki can produce', () => {
      expect(priorityWeight('difficult', { lapseRatio: 2 }, NOW)).toBe(
        priorityWeight('difficult', { lapseRatio: 1 }, NOW),
      );
      expect(
        priorityWeight('difficult', { lapseRatio: Number.NaN, easeFactor: Number.NaN }, NOW),
      ).toBe(priorityWeight('difficult', { lapseRatio: 0, easeFactor: 0 }, NOW));
    });
  });
});

describe('sampleWeightedPalette', () => {
  it('samples without replacement and respects the size cap', () => {
    const candidates = ids(4).map((id, index) => ({ id, intervalDays: index + 1 }));
    const sampled = sampleWeightedPalette(candidates, 20, 'recent', lastAlways, NOW);

    expect(sampled).toHaveLength(4);
    expect(new Set(sampled).size).toBe(4);
  });

  it('does not repeat an item even when a malformed candidate list repeats its id', () => {
    const id = vocabularyItemId('duplicate');
    const sampled = sampleWeightedPalette(
      [
        { id, intervalDays: 1 },
        { id, intervalDays: 2 },
        { id: vocabularyItemId('other'), intervalDays: 3 },
      ],
      10,
      'recent',
      firstAlways,
      NOW,
    );

    expect(sampled).toEqual([id, vocabularyItemId('other')]);
  });

  it('keeps uniform mode on the established sampler', () => {
    const candidates = ids(4).map((id) => ({ id }));
    expect(sampleWeightedPalette(candidates, 2, 'uniform', lastAlways, NOW)).toEqual([
      vocabularyItemId('v3'),
      vocabularyItemId('v0'),
    ]);
  });

  it('gives a snapshot with no signals an unbiased draw', () => {
    // The property that makes silent degradation defensible: a snapshot taken
    // before these signals existed is sampled neutrally, not misleadingly. The
    // two samplers consume randomness differently, so the guarantee is equal
    // weights and a complete, repeat-free draw — not an identical sequence.
    const candidates = ids(6).map((id) => ({ id }));
    expect(priorityWeight('recent', {}, NOW)).toBe(NEUTRAL);
    for (const random of [firstAlways, lastAlways]) {
      const sampled = sampleWeightedPalette(candidates, 6, 'recent', random, NOW);
      expect(new Set(sampled)).toEqual(new Set(candidates.map((candidate) => candidate.id)));
    }
  });

  it('draws the recently learned word first when randomness does not intervene', () => {
    const candidates = [
      { id: vocabularyItemId('old'), firstReviewedAt: NOW - 730 * DAY },
      { id: vocabularyItemId('new'), firstReviewedAt: NOW },
    ];

    expect(sampleWeightedPalette(candidates, 1, 'recent', firstAlways, NOW)).toEqual([
      vocabularyItemId('old'),
    ]);
    expect(sampleWeightedPalette(candidates, 1, 'recent', lastAlways, NOW)).toEqual([
      vocabularyItemId('new'),
    ]);
  });

  it('leaves a floor-weight word reachable rather than starved', () => {
    // The palette is inspiration, not the allowlist, so the tail must thin out
    // without disappearing; two stories from one snapshot should still differ.
    const candidates = [
      { id: vocabularyItemId('fresh'), firstReviewedAt: NOW },
      { id: vocabularyItemId('ancient'), firstReviewedAt: NOW - 3_650 * DAY },
    ];

    expect(sampleWeightedPalette(candidates, 1, 'recent', lastAlways, NOW)).toEqual([
      vocabularyItemId('ancient'),
    ]);
  });

  it('reads the time it is given rather than the wall clock', () => {
    const recent = { id: vocabularyItemId('a'), firstReviewedAt: NOW };

    expect(priorityWeight('recent', recent, NOW)).toBe(CEILING);
    expect(priorityWeight('recent', recent, NOW + 730 * DAY)).toBeLessThan(NEUTRAL);
  });
});
