import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
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
    vocabularyStrictness: 'standard',
    exceptionCount: 0,
    preparationTargets: ['english', 'grammar'],
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
    it('claims no aid the story does not yet have', () => {
      const draft = service.build(acceptedStory(3));

      expect(draft.reading.translationSummary).toEqual({ total: 3, completed: 0, failed: 0 });
      expect(draft.reading.grammarSummary).toEqual({ state: 'not-requested' });
      expect(draft.reading.audioSummary).toEqual({ total: 3, completed: 0, failed: 0 });
      // The empty summaries are what storage accepts: an aid row is written by
      // the preparation lane, never by the save that creates the story.
      expect(() => {
        assertEnrichmentConsistent(draft);
      }).not.toThrow();
    });

    it('gives every sentence a real id and a content hash', () => {
      const draft = service.build(acceptedStory(2));

      expect(new Set(draft.sentences.map((sentence) => sentence.id)).size).toBe(2);
      expect(draft.sentences.every((sentence) => sentence.contentHash.length > 0)).toBe(true);
    });

    it('records the strictness and the targets this run was made under', () => {
      const draft = service.build({
        ...acceptedStory(2),
        vocabularyStrictness: 'strict',
        preparationTargets: ['english', 'audio'],
      });

      // Provenance describes the day, not today: the reading's own declaration
      // is the mutable one, and the two are allowed to drift apart.
      expect(draft.provenance.vocabularyStrictness).toBe('strict');
      expect(draft.provenance.preparationTargets).toEqual(['english', 'audio']);
    });
  });

  it('saves the story with the aid layers it was asked to be prepared with', () => {
    const draft = service.build({
      ...acceptedStory(3),
      preparationTargets: ['english', 'audio'],
    });

    expect(draft.reading.preparationTargets).toEqual(['english', 'audio']);
  });
});
