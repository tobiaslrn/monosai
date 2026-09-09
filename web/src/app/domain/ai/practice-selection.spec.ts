import { describe, expect, it } from 'vitest';
import type { RandomSource } from '../shared/random';
import { vocabularyItemId, type VocabularyItemId } from '../shared/ids';
import type { PracticeEvidence } from '../anki/practice-evidence';
import {
  isDifficultCandidate,
  isRecentCandidate,
  practiceReasonsFor,
  practiceTargetLimit,
  selectPracticeTargets,
  type PracticeCandidate,
} from './practice-selection';

/** Always draws the first remaining entry, so a draw is readable in a test. */
const firstAlways: RandomSource = { nextInt: () => 0 };

/** Draws the last remaining entry, to show a different draw over one pool. */
const lastAlways: RandomSource = { nextInt: (exclusiveMax) => Math.max(0, exclusiveMax - 1) };

function candidate(
  expression: string,
  practice: PracticeEvidence = {},
  fsrsDifficulty?: number,
): PracticeCandidate {
  return {
    canonicalExpression: expression,
    visibleExpression: expression,
    expressionHash: `hash-${expression}`,
    itemIds: [vocabularyItemId(`item-${expression}`)] as readonly VocabularyItemId[],
    practice,
    ...(fsrsDifficulty === undefined ? {} : { fsrsDifficulty }),
  };
}

describe('how many words a story practises', () => {
  it('grows in steps with the requested length', () => {
    expect(practiceTargetLimit(5)).toBe(3);
    expect(practiceTargetLimit(15)).toBe(6);
    expect(practiceTargetLimit(30)).toBe(8);
    expect(practiceTargetLimit(50)).toBe(12);
    expect(practiceTargetLimit(800)).toBe(12);
  });

  it('falls back to the smallest step for a length it cannot read', () => {
    expect(practiceTargetLimit(Number.NaN)).toBe(3);
  });
});

describe('what counts as evidence', () => {
  it('reads recency from the pool the source proved, not from a schedule', () => {
    expect(isRecentCandidate(candidate('a', { answeredWithinDays: 1 }), 3)).toBe(true);
    expect(isRecentCandidate(candidate('a', { answeredWithinDays: 7 }), 3)).toBe(false);
    expect(isRecentCandidate(candidate('a', { recentlyAnsweredWithShortInterval: true }), 7)).toBe(
      false,
    );
  });

  it('never calls a word difficult because nothing is known about it', () => {
    expect(isDifficultCandidate(candidate('a'))).toBe(false);
    expect(isDifficultCandidate(candidate('a', {}, 6.9))).toBe(false);
    expect(isDifficultCandidate(candidate('a', {}, 7))).toBe(true);
    expect(isDifficultCandidate(candidate('a', { answeredAgain: true }))).toBe(true);
    expect(isDifficultCandidate(candidate('a', { answeredHard: true }))).toBe(true);
  });

  it('rejects an FSRS value outside the scale it claims to be on', () => {
    expect(isDifficultCandidate(candidate('a', {}, 42))).toBe(false);
    expect(isDifficultCandidate(candidate('a', {}, Number.POSITIVE_INFINITY))).toBe(false);
  });

  it('gives one word every reason that applies to it', () => {
    expect(
      practiceReasonsFor(
        candidate('a', { answeredWithinDays: 1, recentlyAnsweredWhileLearning: true }, 8),
        3,
        'automatic',
      ),
    ).toEqual(['recent-practice', 'still-learning', 'difficult-in-anki']);
  });

  it('says only that a manually picked word was picked', () => {
    expect(practiceReasonsFor(candidate('a', { answeredAgain: true }), 3, 'manual')).toEqual([
      'chosen',
    ]);
  });
});

describe('recent practice', () => {
  it('prefers words still being learned, then short intervals, then the rest', () => {
    const selection = selectPracticeTargets({
      mode: 'recent',
      windowDays: 3,
      limit: 2,
      random: firstAlways,
      candidates: [
        candidate('settled', { answeredWithinDays: 1 }),
        candidate('short', { answeredWithinDays: 1, recentlyAnsweredWithShortInterval: true }),
        candidate('learning', { answeredWithinDays: 1, recentlyAnsweredWhileLearning: true }),
      ],
    });
    expect(selection.targets.map((target) => target.canonicalExpression)).toEqual([
      'learning',
      'short',
    ]);
  });

  it('keeps a word whose native membership is proven but whose metadata is absent', () => {
    const selection = selectPracticeTargets({
      mode: 'recent',
      windowDays: 1,
      limit: 3,
      random: firstAlways,
      candidates: [candidate('proven', { answeredWithinDays: 1 })],
    });
    expect(selection.targets).toHaveLength(1);
    expect(selection.targets[0].reasons).toEqual(['recent-practice']);
  });

  it('returns fewer targets rather than padding with unrelated words', () => {
    const selection = selectPracticeTargets({
      mode: 'recent',
      windowDays: 3,
      limit: 6,
      random: firstAlways,
      candidates: [candidate('recent', { answeredWithinDays: 1 }), candidate('unstudied')],
    });
    expect(selection.targets.map((target) => target.canonicalExpression)).toEqual(['recent']);
    expect(selection.recentCandidateCount).toBe(1);
  });

  it('is empty when the period proved nothing, and says the pool was empty', () => {
    const selection = selectPracticeTargets({
      mode: 'recent',
      windowDays: 1,
      limit: 6,
      random: firstAlways,
      candidates: [candidate('older', { answeredWithinDays: 7 })],
    });
    expect(selection.targets).toEqual([]);
    expect(selection.recentCandidateCount).toBe(0);
  });
});

describe('difficult words', () => {
  it('takes Again answers before Hard answers before FSRS difficulty', () => {
    const selection = selectPracticeTargets({
      mode: 'difficult',
      windowDays: 3,
      limit: 2,
      random: firstAlways,
      candidates: [
        candidate('fsrs', {}, 9),
        candidate('hard', { answeredHard: true }),
        candidate('again', { answeredAgain: true }),
      ],
    });
    expect(selection.targets.map((target) => target.canonicalExpression)).toEqual([
      'again',
      'hard',
    ]);
  });

  it('produces nothing from a vocabulary with no positive difficulty evidence', () => {
    const selection = selectPracticeTargets({
      mode: 'difficult',
      windowDays: 3,
      limit: 6,
      random: firstAlways,
      candidates: [candidate('a'), candidate('b'), candidate('c')],
    });
    expect(selection.targets).toEqual([]);
    expect(selection.difficultCandidateCount).toBe(0);
  });
});

describe('daily practice', () => {
  const pool = [
    candidate('recent-1', { answeredWithinDays: 1 }),
    candidate('recent-2', { answeredWithinDays: 1 }),
    candidate('recent-3', { answeredWithinDays: 3 }),
    candidate('recent-4', { answeredWithinDays: 3 }),
    candidate('hard-1', { answeredAgain: true }),
    candidate('hard-2', { answeredHard: true }),
  ];

  it('reserves two thirds of the slots for recent practice', () => {
    const selection = selectPracticeTargets({
      mode: 'daily',
      windowDays: 3,
      limit: 6,
      random: firstAlways,
      candidates: pool,
    });
    const recent = selection.targets.filter((target) => target.reasons.includes('recent-practice'));
    expect(selection.targets).toHaveLength(6);
    expect(recent).toHaveLength(4);
  });

  it('fills from recent practice when nothing is difficult', () => {
    const selection = selectPracticeTargets({
      mode: 'daily',
      windowDays: 3,
      limit: 3,
      random: firstAlways,
      candidates: [
        candidate('recent-1', { answeredWithinDays: 1 }),
        candidate('recent-2', { answeredWithinDays: 1 }),
        candidate('recent-3', { answeredWithinDays: 1 }),
      ],
    });
    expect(selection.targets).toHaveLength(3);
    expect(selection.difficultCandidateCount).toBe(0);
  });

  it('fills from difficult words when nothing was answered in the period', () => {
    const selection = selectPracticeTargets({
      mode: 'daily',
      windowDays: 1,
      limit: 3,
      random: firstAlways,
      candidates: [
        candidate('hard-1', { answeredAgain: true }),
        candidate('hard-2', { answeredHard: true }),
        candidate('hard-3', {}, 8),
      ],
    });
    expect(selection.targets).toHaveLength(3);
    expect(selection.recentCandidateCount).toBe(0);
  });

  it('spends an overlapping word once, on one slot, with both reasons', () => {
    const selection = selectPracticeTargets({
      mode: 'daily',
      windowDays: 3,
      limit: 3,
      random: firstAlways,
      candidates: [
        candidate('both', { answeredWithinDays: 1, answeredAgain: true }),
        candidate('recent', { answeredWithinDays: 1 }),
      ],
    });
    expect(selection.targets).toHaveLength(2);
    const both = selection.targets.find((target) => target.canonicalExpression === 'both');
    expect(both?.reasons).toEqual(['recent-practice', 'answered-again']);
  });
});

describe('free reading', () => {
  it('asks for no targets at all', () => {
    const selection = selectPracticeTargets({
      mode: 'free',
      windowDays: 3,
      limit: 6,
      random: firstAlways,
      pinned: ['gone'],
      candidates: [candidate('recent', { answeredWithinDays: 1 })],
    });
    expect(selection.targets).toEqual([]);
    expect(selection.unavailablePins).toEqual([]);
  });
});

describe('words the learner picked', () => {
  const pool = [
    candidate('picked', { answeredWithinDays: 7 }),
    candidate('recent-1', { answeredWithinDays: 1 }),
    candidate('recent-2', { answeredWithinDays: 1 }),
  ];

  it('keeps them in the list even when the mode would not have chosen them', () => {
    const selection = selectPracticeTargets({
      mode: 'recent',
      windowDays: 1,
      limit: 2,
      random: firstAlways,
      pinned: ['picked'],
      candidates: pool,
    });
    expect(selection.targets[0]).toMatchObject({
      canonicalExpression: 'picked',
      origin: 'manual',
      reasons: ['chosen'],
    });
    expect(selection.targets).toHaveLength(2);
  });

  it('lets them occupy slots the automatic draw then has to do without', () => {
    const selection = selectPracticeTargets({
      mode: 'recent',
      windowDays: 1,
      limit: 1,
      random: firstAlways,
      pinned: ['picked'],
      candidates: pool,
    });
    expect(selection.targets).toHaveLength(1);
    expect(selection.targets[0].origin).toBe('manual');
  });

  it('never draws a picked word a second time automatically', () => {
    const selection = selectPracticeTargets({
      mode: 'recent',
      windowDays: 1,
      limit: 3,
      random: firstAlways,
      pinned: ['recent-1'],
      candidates: pool,
    });
    expect(selection.targets.map((target) => target.canonicalExpression)).toEqual([
      'recent-1',
      'recent-2',
    ]);
  });

  it('reports a picked word the vocabulary no longer has instead of sending it', () => {
    const selection = selectPracticeTargets({
      mode: 'recent',
      windowDays: 1,
      limit: 3,
      random: firstAlways,
      pinned: ['removed'],
      candidates: pool,
    });
    expect(selection.unavailablePins).toEqual(['removed']);
    expect(selection.targets.some((target) => target.canonicalExpression === 'removed')).toBe(
      false,
    );
  });
});

describe('the draw itself', () => {
  const pool = [
    candidate('a', { answeredWithinDays: 1 }),
    candidate('b', { answeredWithinDays: 1 }),
    candidate('c', { answeredWithinDays: 1 }),
  ];

  it('is decided only by the injected randomness', () => {
    const first = selectPracticeTargets({
      mode: 'recent',
      windowDays: 1,
      limit: 1,
      random: firstAlways,
      candidates: pool,
    });
    const last = selectPracticeTargets({
      mode: 'recent',
      windowDays: 1,
      limit: 1,
      random: lastAlways,
      candidates: pool,
    });
    expect(first.targets[0].canonicalExpression).toBe('a');
    expect(last.targets[0].canonicalExpression).toBe('c');
  });

  it('does not depend on the order the sources were read in', () => {
    const forwards = selectPracticeTargets({
      mode: 'recent',
      windowDays: 1,
      limit: 2,
      random: firstAlways,
      candidates: pool,
    });
    const backwards = selectPracticeTargets({
      mode: 'recent',
      windowDays: 1,
      limit: 2,
      random: firstAlways,
      candidates: [...pool].reverse(),
    });
    expect(forwards.targets.map((target) => target.canonicalExpression)).toEqual(
      backwards.targets.map((target) => target.canonicalExpression),
    );
  });

  it('counts one expression once however many notes produced it', () => {
    const selection = selectPracticeTargets({
      mode: 'recent',
      windowDays: 1,
      limit: 3,
      random: firstAlways,
      candidates: [
        candidate('duplicate', { answeredWithinDays: 1 }),
        candidate('duplicate', { answeredWithinDays: 1 }),
      ],
    });
    expect(selection.targets).toHaveLength(1);
    expect(selection.recentCandidateCount).toBe(1);
  });

  it('carries every item id a target has, so a later sync cannot orphan it', () => {
    const selection = selectPracticeTargets({
      mode: 'recent',
      windowDays: 1,
      limit: 1,
      random: firstAlways,
      candidates: [
        {
          ...candidate('word', { answeredWithinDays: 1 }),
          itemIds: [vocabularyItemId('one'), vocabularyItemId('two')],
        },
      ],
    });
    expect(selection.targets[0].itemIds).toEqual([
      vocabularyItemId('one'),
      vocabularyItemId('two'),
    ]);
  });
});
