import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StoryGenerationRequest } from '../../domain/ai/story-request';
import { snapshotId, vocabularyItemId, type SnapshotId } from '../../domain/shared/ids';
import { fixedClock } from '../../domain/shared/clock';
import type { RandomSource } from '../../domain/shared/random';
import type { VocabularyItem } from '../../domain/vocabulary/snapshot';
import { CLOCK, RANDOM_SOURCE, VOCABULARY_REPOSITORY } from '../shared/repository-tokens';
import { StubVocabularyRepository } from '../../../testing/vocabulary-fakes';
import { VocabularyPreparationService } from './vocabulary-preparation.service';

const SNAPSHOT: SnapshotId = snapshotId('00000000-0000-4000-8000-00000000aaaa');
const NOW = 1_780_000_000_000;
const DAY = 86_400_000;

function item(index: number, canonicalExpression: string): VocabularyItem {
  return {
    id: vocabularyItemId(`00000000-0000-4000-8000-1000${String(index).padStart(8, '0')}`),
    snapshotId: SNAPSHOT,
    visibleExpression: canonicalExpression,
    canonicalExpression,
    expressionHash: `h(${canonicalExpression})`,
    analyzedSequence: [{ surface: canonicalExpression }],
  };
}

describe('VocabularyPreparationService', () => {
  let repository: StubVocabularyRepository;
  let service: VocabularyPreparationService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    repository = new StubVocabularyRepository();
    TestBed.configureTestingModule({
      providers: [
        VocabularyPreparationService,
        { provide: VOCABULARY_REPOSITORY, useValue: repository },
        { provide: RANDOM_SOURCE, useValue: { nextInt: () => 0 } satisfies RandomSource },
        { provide: CLOCK, useValue: fixedClock(NOW) },
      ],
    });
    service = TestBed.inject(VocabularyPreparationService);
  });

  function seed(count: number): void {
    repository.items.push(
      ...Array.from({ length: count }, (_value, index) => item(index, `語${String(index)}`)),
    );
  }

  it('builds the allowlist from canonical expressions', async () => {
    seed(120);

    const prepared = await service.prepare(SNAPSHOT, 'micro');

    expect(prepared.ok).toBe(true);
    if (!prepared.ok) {
      return;
    }
    expect(prepared.value.allowedVocabulary).toHaveLength(120);
    expect(prepared.value.uniqueExpressionCount).toBe(120);
  });

  it('collapses two notes for the same word into one allowlist entry', async () => {
    repository.items.push(item(0, '猫'), item(1, '猫'), item(2, '犬'));

    const prepared = await service.prepare(SNAPSHOT, 'micro');

    expect(prepared.ok && prepared.value.allowedVocabulary).toEqual(['猫', '犬']);
  });

  it('samples the Micro palette size and records the ids for provenance', async () => {
    seed(120);

    const prepared = await service.prepare(SNAPSHOT, 'micro');

    expect(prepared.ok).toBe(true);
    if (!prepared.ok) {
      return;
    }
    expect(prepared.value.suggestedItemIds).toHaveLength(40);
    expect(prepared.value.suggestedVocabulary).toHaveLength(40);
  });

  it('samples the larger Short palette', async () => {
    seed(300);

    const prepared = await service.prepare(SNAPSHOT, 'short');

    expect(prepared.ok && prepared.value.suggestedItemIds).toHaveLength(100);
  });

  it('samples the largest palette for a Long story', async () => {
    seed(300);

    const prepared = await service.prepare(SNAPSHOT, 'long');

    expect(prepared.ok && prepared.value.suggestedItemIds).toHaveLength(180);
  });

  it('caps the palette at what a small snapshot can supply', async () => {
    seed(12);

    const prepared = await service.prepare(SNAPSHOT, 'short');

    expect(prepared.ok && prepared.value.suggestedItemIds).toHaveLength(12);
  });

  it('reads nothing from another snapshot', async () => {
    repository.items.push({
      ...item(0, 'よそ'),
      snapshotId: snapshotId('00000000-0000-4000-8000-00000000bbbb'),
    });

    const prepared = await service.prepare(SNAPSHOT, 'micro');

    expect(prepared.ok && prepared.value.allowedVocabulary).toEqual([]);
  });

  function request(allowedVocabulary: readonly string[]): StoryGenerationRequest {
    return {
      form: 'micro',
      requestedSentenceCount: 5,
      premise: 'ねこの話。',
      allowedVocabulary,
      suggestedVocabulary: [],
      structuralBaseline: ['は'],
      grammarGuidance: 'Write single short clauses.',
      registerPreference: 'either',
      snapshotId: SNAPSHOT,
      grammarProfileHash: 'hash',
      promptVersion: 'story/1',
    };
  }

  describe('priority modes', () => {
    /**
     * A deterministic but genuinely spread source.
     *
     * The suite's usual `() => 0` always draws the first candidate in the pool,
     * which would make a weighted sample look unweighted; tickets have to be
     * spread across the range for a weight to be able to decide anything.
     */
    function seededRandom(): RandomSource {
      let state = 123_456_789;
      return {
        nextInt: (exclusiveMax) => {
          state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
          return state % exclusiveMax;
        },
      };
    }

    beforeEach(() => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          VocabularyPreparationService,
          { provide: VOCABULARY_REPOSITORY, useValue: repository },
          { provide: RANDOM_SOURCE, useValue: seededRandom() },
          { provide: CLOCK, useValue: fixedClock(NOW) },
        ],
      });
      service = TestBed.inject(VocabularyPreparationService);
    });

    /** Half the snapshot learned this week, half two years ago. */
    function seedByAge(count: number): void {
      repository.items.push(
        ...Array.from({ length: count }, (_value, index) => ({
          ...item(index, `語${String(index)}`),
          firstReviewedAt: index < count / 2 ? NOW - 730 * DAY : NOW - DAY,
        })),
      );
    }

    it('focuses on the newest words and keeps them out of the palette', async () => {
      seedByAge(80);

      const prepared = await service.prepare(SNAPSHOT, 'micro', 'recent', 25);

      expect(prepared.ok).toBe(true);
      if (!prepared.ok) return;
      const focus = prepared.value.focusVocabulary;
      expect(focus).toHaveLength(25);
      // The fresh half was all reviewed yesterday, so the expression breaks the tie.
      expect(focus.every((word) => Number(word.expression.slice(1)) >= 40)).toBe(true);
      expect(focus.every((word) => word.firstSeen === 'yesterday')).toBe(true);
      const focused = new Set(focus.map((word) => word.expression));
      expect(prepared.value.suggestedVocabulary.some((word) => focused.has(word))).toBe(false);
      expect(prepared.value.suggestedVocabulary).toHaveLength(40);
      expect(prepared.value.allowedVocabulary).toHaveLength(80);
    });

    it('uses the default size of fifty', async () => {
      seedByAge(80);

      const prepared = await service.prepare(SNAPSHOT, 'micro', 'recent');

      expect(prepared.ok && prepared.value.focusVocabulary).toHaveLength(50);
    });

    it('chooses no focus outside Recently learned', async () => {
      seedByAge(80);

      const uniform = await service.prepare(SNAPSHOT, 'micro', 'uniform');
      const difficult = await service.prepare(SNAPSHOT, 'micro', 'difficult');

      expect(uniform.ok && uniform.value.focusVocabulary).toEqual([]);
      expect(difficult.ok && difficult.value.focusVocabulary).toEqual([]);
    });

    it('fills the palette with the words the learner finds hard', async () => {
      repository.items.push(
        ...Array.from({ length: 80 }, (_value, index) => ({
          ...item(index, `語${String(index)}`),
          fsrsDifficulty: index < 40 ? 1.5 : 9.5,
        })),
      );

      const prepared = await service.prepare(SNAPSHOT, 'micro', 'difficult');

      expect(prepared.ok).toBe(true);
      if (!prepared.ok) return;
      const hard = prepared.value.suggestedVocabulary.filter(
        (expression) => Number(expression.slice(1)) >= 40,
      );
      expect(hard.length).toBeGreaterThan(prepared.value.suggestedVocabulary.length * 0.75);
    });

    it('proceeds without a focus when no word carries a first review', async () => {
      // What a learner sees before re-syncing: an ordinary palette, no focus.
      seed(80);

      const prepared = await service.prepare(SNAPSHOT, 'micro', 'recent');

      expect(prepared.ok).toBe(true);
      if (!prepared.ok) return;
      expect(prepared.value.focusVocabulary).toEqual([]);
      expect(new Set(prepared.value.suggestedItemIds).size).toBe(40);
    });

    it('merges the first reviews of two notes for one word before ordering', async () => {
      repository.items.push(
        { ...item(0, '猫'), firstReviewedAt: NOW - 730 * DAY },
        { ...item(1, '猫'), firstReviewedAt: NOW - DAY },
        { ...item(2, '犬'), firstReviewedAt: NOW - 3 * DAY },
      );

      const prepared = await service.prepare(SNAPSHOT, 'micro', 'recent');

      expect(prepared.ok).toBe(true);
      if (!prepared.ok) return;
      // The earlier of the two dates wins, so 猫 is the older word of the pair.
      expect(prepared.value.allowedVocabulary).toEqual(['猫', '犬']);
      expect(prepared.value.focusVocabulary.map((word) => word.expression)).toEqual(['犬', '猫']);
      expect(prepared.value.suggestedVocabulary).toEqual([]);
    });
  });

  it('lets a realistic request through the budget guard', () => {
    const guarded = service.guardBudget(
      request(Array.from({ length: 1_800 }, () => '国際交流基金')),
    );

    expect(guarded.ok).toBe(true);
  });

  it('refuses an oversized request before it is paid for', () => {
    const guarded = service.guardBudget(
      request(Array.from({ length: 100_000 }, (_value, index) => `語${String(index)}`)),
    );

    expect(guarded.ok).toBe(false);
    if (guarded.ok) {
      return;
    }
    expect(guarded.error.code).toBe('context-budget-exceeded');
  });
});
