import { describe, expect, it } from 'vitest';
import {
  hasRecentDifficulty,
  isLearningCardType,
  mergeObservationBases,
  mergePracticeEvidence,
  normalizePracticeEvidence,
  unmeasuredBasis,
  wasAnsweredWithin,
  type PracticeObservationBasis,
} from './practice-evidence';

const OBSERVED_AT = 1_757_000_000_000;

function basis(overrides: Partial<PracticeObservationBasis> = {}): PracticeObservationBasis {
  return {
    recentAnswers: 'available',
    recentDifficulty: 'available',
    learningState: 'available',
    fsrsDifficulty: 'available',
    windowBasis: 'anki-study-days',
    observedAt: OBSERVED_AT,
    ...overrides,
  };
}

describe('answered-within windows', () => {
  it('reports the narrower pools as containing a word answered today', () => {
    const evidence = { answeredWithinDays: 1 } as const;
    expect(wasAnsweredWithin(evidence, 1, basis())).toBe(true);
    expect(wasAnsweredWithin(evidence, 3, basis())).toBe(true);
    expect(wasAnsweredWithin(evidence, 7, basis())).toBe(true);
  });

  it('keeps a word answered five days ago out of the narrower pools', () => {
    const evidence = { answeredWithinDays: 7 } as const;
    expect(wasAnsweredWithin(evidence, 1, basis())).toBe(false);
    expect(wasAnsweredWithin(evidence, 3, basis())).toBe(false);
    expect(wasAnsweredWithin(evidence, 7, basis())).toBe(true);
  });

  it('separates a proven no from a question the source could not answer', () => {
    // The difference decides whether the learner sees an empty focus state or a
    // stated limitation, so it must never collapse into one falsy value.
    expect(wasAnsweredWithin(undefined, 7, basis())).toBe(false);
    expect(
      wasAnsweredWithin(undefined, 7, basis({ recentAnswers: 'unsupported' })),
    ).toBeUndefined();
    expect(
      wasAnsweredWithin({ answeredWithinDays: 1 }, 7, basis({ recentAnswers: 'unavailable' })),
    ).toBeUndefined();
  });
});

describe('recent difficulty', () => {
  it('counts either answer as positive evidence', () => {
    expect(hasRecentDifficulty({ answeredAgain: true }, basis())).toBe(true);
    expect(hasRecentDifficulty({ answeredHard: true }, basis())).toBe(true);
    expect(hasRecentDifficulty({ answeredWithinDays: 1 }, basis())).toBe(false);
  });

  it('answers nothing when the searches were not available', () => {
    expect(
      hasRecentDifficulty({ answeredAgain: true }, basis({ recentDifficulty: 'unavailable' })),
    ).toBeUndefined();
  });
});

describe('normalization', () => {
  it('drops a window the searches never produce', () => {
    expect(normalizePracticeEvidence({ answeredWithinDays: 4 as never })).toEqual({});
    expect(normalizePracticeEvidence({ answeredWithinDays: 3 })).toEqual({ answeredWithinDays: 3 });
  });

  it('stores only positive flags, so absence has one shape', () => {
    expect(normalizePracticeEvidence({ answeredAgain: false, answeredHard: true })).toEqual({
      answeredHard: true,
    });
    expect(normalizePracticeEvidence(null)).toEqual({});
  });
});

describe('merging expressions', () => {
  it('keeps the narrowest window and every positive flag', () => {
    expect(
      mergePracticeEvidence(
        { answeredWithinDays: 7, answeredHard: true },
        { answeredWithinDays: 1, answeredAgain: true },
      ),
    ).toEqual({ answeredWithinDays: 1, answeredAgain: true, answeredHard: true });
  });

  it('cannot invent a membership from two words that lack one', () => {
    expect(mergePracticeEvidence({}, {})).toEqual({});
    expect(mergePracticeEvidence(undefined, undefined)).toEqual({});
  });

  it('carries a correlated membership through without widening it', () => {
    // The flag already means one card met both conditions; merging must not turn
    // two separate half-matches into a claim about a card that has neither.
    expect(
      mergePracticeEvidence({ answeredWithinDays: 1 }, { recentlyAnsweredWhileLearning: true }),
    ).toEqual({ answeredWithinDays: 1, recentlyAnsweredWhileLearning: true });
  });
});

describe('merging capture bases', () => {
  it('lets the weakest source decide what the combination proved', () => {
    const merged = mergeObservationBases(
      basis(),
      basis({ recentAnswers: 'unavailable', fsrsDifficulty: 'unsupported' }),
    );
    expect(merged.recentAnswers).toBe('unavailable');
    expect(merged.fsrsDifficulty).toBe('unsupported');
    expect(merged.recentDifficulty).toBe('available');
  });

  it('reports the oldest observation and the coarser window basis', () => {
    const merged = mergeObservationBases(
      basis(),
      basis({ observedAt: OBSERVED_AT - 86_400_000, windowBasis: 'rolling-days' }),
    );
    expect(merged.observedAt).toBe(OBSERVED_AT - 86_400_000);
    expect(merged.windowBasis).toBe('rolling-days');
  });

  it('leaves a capture that measured nothing unable to answer anything', () => {
    const merged = mergeObservationBases(basis(), unmeasuredBasis(OBSERVED_AT));
    expect(merged.recentAnswers).toBe('unsupported');
    expect(merged.recentDifficulty).toBe('unsupported');
  });
});

describe('learning card types', () => {
  it('recognises learning and relearning, and nothing else', () => {
    expect(isLearningCardType(1)).toBe(true);
    expect(isLearningCardType(3)).toBe(true);
    expect(isLearningCardType(0)).toBe(false);
    expect(isLearningCardType(2)).toBe(false);
    expect(isLearningCardType(undefined)).toBe(false);
  });
});
