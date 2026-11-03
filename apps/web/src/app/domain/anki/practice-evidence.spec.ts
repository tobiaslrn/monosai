import { describe, expect, it } from 'vitest';
import {
  isLearningCardType,
  mergePracticeEvidence,
  normalizePracticeEvidence,
  unmeasuredBasis,
} from './practice-evidence';

const OBSERVED_AT = 1_757_000_000_000;

describe('an unmeasured capture', () => {
  it('can answer nothing at all, which is not the same as answering no', () => {
    const unmeasured = unmeasuredBasis(OBSERVED_AT);
    expect(unmeasured.recentAnswers).toBe('unsupported');
    expect(unmeasured.recentDifficulty).toBe('unsupported');
    expect(unmeasured.learningState).toBe('unsupported');
    expect(unmeasured.fsrsDifficulty).toBe('unsupported');
    expect(unmeasured.observedAt).toBe(OBSERVED_AT);
  });
});

describe('normalization', () => {
  it('drops a window the searches never produce', () => {
    expect(normalizePracticeEvidence({ answeredWithinDays: 4 })).toEqual({});
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

describe('learning card types', () => {
  it('recognises learning and relearning, and nothing else', () => {
    expect(isLearningCardType(1)).toBe(true);
    expect(isLearningCardType(3)).toBe(true);
    expect(isLearningCardType(0)).toBe(false);
    expect(isLearningCardType(2)).toBe(false);
    expect(isLearningCardType(undefined)).toBe(false);
  });
});
