import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { aiError } from '../../domain/ai/ai-error';
import type { GrammarRunOutcome } from '../enrichment/grammar-analysis.service';
import type { TranslationRunOutcome } from '../enrichment/translation.service';
import { assertEnrichmentConsistent } from '../../infrastructure/persistence/repositories/integrity';
import { fixedClock } from '../../domain/shared/clock';
import type { Hasher } from '../../domain/shared/hashing';
import { snapshotId } from '../../domain/shared/ids';
import { CLOCK, HASHER, ID_GENERATOR, READING_REPOSITORY } from '../shared/repository-tokens';
import { FakeReadingRepository } from '../../../testing/reading-repository-fake';
import { StoryAssemblyService, type AcceptedStory } from './story-assembly.service';

const TEST_HASHER: Hasher = { algorithm: 'test', hashText: (text) => `h(${text})` };

function sequentialIds(): { nextId: () => string } {
  let next = 0;
  return {
    nextId: () => {
      next += 1;
      return `00000000-0000-4000-8000-${String(next).padStart(12, '0')}`;
    },
  };
}

function acceptedStory(sentenceCount: number): AcceptedStory {
  return {
    titleJa: 'タイトル',
    sentences: Array.from({ length: sentenceCount }, (_value, index) => ({
      textJa: `文${String(index)}。`,
      tokens: [],
      statuses: [],
    })),
    form: 'micro',
    premise: '前提。',
    snapshotId: snapshotId('00000000-0000-4000-8000-00000000aaaa'),
    validatorVersion: 'validator/1',
    grammarProfileSnapshotId: 'profile-capture',
    exceptionPolicyHash: 'policy-hash',
    modelId: 'vendor/model',
    requestedSentenceCount: 5,
    repairAttempts: 0,
    suggestedVocabularyItemIds: [],
    exceptionCount: 0,
  };
}

describe('StoryAssemblyService', () => {
  let service: StoryAssemblyService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        StoryAssemblyService,
        { provide: READING_REPOSITORY, useValue: new FakeReadingRepository() },
        { provide: CLOCK, useValue: fixedClock(1_000) },
        { provide: HASHER, useValue: TEST_HASHER },
        { provide: ID_GENERATOR, useValue: sequentialIds() },
      ],
    });
    service = TestBed.inject(StoryAssemblyService);
  });

  describe('build', () => {
    it('leaves the auxiliary summaries at their pre-review defaults', () => {
      const draft = service.build(acceptedStory(3));

      expect(draft.reading.translationSummary).toEqual({ total: 3, completed: 0, failed: 0 });
      expect(draft.reading.grammarSummary).toEqual({ state: 'not-requested' });
      expect(draft.translations).toEqual([]);
      expect(draft.grammarAnalyses).toEqual([]);
    });

    it('gives every sentence a real id and a content hash', () => {
      const draft = service.build(acceptedStory(2));

      expect(new Set(draft.sentences.map((sentence) => sentence.id)).size).toBe(2);
      expect(draft.sentences.every((sentence) => sentence.contentHash.length > 0)).toBe(true);
    });
  });

  describe('withAuxiliary', () => {
    function translationSuccess(
      draft: ReturnType<StoryAssemblyService['build']>,
    ): TranslationRunOutcome {
      return {
        records: draft.sentences.map((sentence, index) => ({
          id: `t${String(index)}`,
          sentenceId: sentence.id,
          readingId: draft.reading.id,
          sourceContentHash: sentence.contentHash,
          textEn: 'EN.',
          modelId: 'vendor/model',
          promptVersion: 'translation/1',
          cacheKey: `key-${String(index)}`,
          createdAt: 1_000,
        })),
        failures: [],
        error: null,
      };
    }

    it('marks a complete grammar review and lets zero-finding sentences through', () => {
      const draft = service.build(acceptedStory(2));
      const grammar: GrammarRunOutcome = {
        status: 'complete',
        records: draft.sentences.map((sentence, index) => ({
          id: `g${String(index)}`,
          sentenceId: sentence.id,
          readingId: draft.reading.id,
          sourceContentHash: sentence.contentHash,
          profileHash: 'profile-hash',
          modelId: 'vendor/model',
          promptVersion: 'grammar/1',
          findings: [],
          cacheKey: `gkey-${String(index)}`,
          createdAt: 1_000,
        })),
      };

      const merged = service.withAuxiliary(draft, grammar, translationSuccess(draft));

      expect(merged.reading.grammarSummary).toEqual({ state: 'complete', concernCount: 0 });
      expect(merged.grammarAnalyses).toHaveLength(2);
      expect(() => {
        assertEnrichmentConsistent(merged);
      }).not.toThrow();
    });

    it('counts only out-of-profile findings toward the concern count', () => {
      const draft = service.build(acceptedStory(1));
      const grammar: GrammarRunOutcome = {
        status: 'complete',
        records: [
          {
            id: 'g0',
            sentenceId: draft.sentences[0].id,
            readingId: draft.reading.id,
            sourceContentHash: draft.sentences[0].contentHash,
            profileHash: 'profile-hash',
            modelId: 'vendor/model',
            promptVersion: 'grammar/1',
            findings: [
              { label: 'a', explanationEn: 'a', confidence: 'high', inProfile: true },
              { label: 'b', explanationEn: 'b', confidence: 'low', inProfile: false },
            ],
            cacheKey: 'gkey-0',
            createdAt: 1_000,
          },
        ],
      };

      const merged = service.withAuxiliary(draft, grammar, translationSuccess(draft));

      expect(merged.reading.grammarSummary).toEqual({ state: 'complete', concernCount: 1 });
    });

    it('marks grammar unavailable and saves zero grammar analyses', () => {
      const draft = service.build(acceptedStory(2));
      const grammar: GrammarRunOutcome = {
        status: 'unavailable',
        records: [],
        reasonCode: 'provider-unavailable',
      };

      const merged = service.withAuxiliary(draft, grammar, translationSuccess(draft));

      expect(merged.reading.grammarSummary).toEqual({
        state: 'unavailable',
        reasonCode: 'provider-unavailable',
      });
      expect(merged.grammarAnalyses).toEqual([]);
      expect(() => {
        assertEnrichmentConsistent(merged);
      }).not.toThrow();
    });

    it('records an honest partial translation summary when some sentences failed', () => {
      const draft = service.build(acceptedStory(3));
      const succeeded = translationSuccess(draft);
      const partial: TranslationRunOutcome = {
        records: succeeded.records.slice(0, 2),
        failures: [draft.sentences[2].id],
        error: aiError('provider-unavailable', 'translation', 'The provider was unavailable.'),
      };
      const grammar: GrammarRunOutcome = { status: 'unavailable', records: [], reasonCode: 'x' };

      const merged = service.withAuxiliary(draft, grammar, partial);

      expect(merged.reading.translationSummary).toEqual({ total: 3, completed: 2, failed: 1 });
      expect(() => {
        assertEnrichmentConsistent(merged);
      }).not.toThrow();
    });
  });
});
