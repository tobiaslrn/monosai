import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StoryGenerationRequest } from '../../domain/ai/story-request';
import { snapshotId, vocabularyItemId, type SnapshotId } from '../../domain/shared/ids';
import type { RandomSource } from '../../domain/shared/random';
import type { VocabularyItem } from '../../domain/vocabulary/snapshot';
import { RANDOM_SOURCE, VOCABULARY_REPOSITORY } from '../shared/repository-tokens';
import { StubVocabularyRepository } from '../../../testing/vocabulary-fakes';
import { VocabularyPreparationService } from './vocabulary-preparation.service';

const SNAPSHOT: SnapshotId = snapshotId('00000000-0000-4000-8000-00000000aaaa');

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

  it('lets a realistic request through the budget guard', () => {
    const guarded = service.guardBudget(
      request(Array.from({ length: 1_800 }, () => '国際交流基金')),
    );

    expect(guarded.ok).toBe(true);
  });

  it('refuses an oversized request before it is paid for', () => {
    const guarded = service.guardBudget(request(Array.from({ length: 100_000 }, () => '猫')));

    expect(guarded.ok).toBe(false);
    if (guarded.ok) {
      return;
    }
    expect(guarded.error.code).toBe('context-budget-exceeded');
  });
});
