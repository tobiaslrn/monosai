import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { configureVocabularyTestBed } from '../../../testing/vocabulary-fakes';
import { snapshotId } from '../../domain/shared/ids';
import { err, type Result } from '../../domain/shared/result';
import { storageError, type StorageError } from '../../domain/storage/storage-error';
import type { VocabularySnapshot } from '../../domain/vocabulary/snapshot';
import { VOCABULARY_REPOSITORY } from '../shared/repository-tokens';
import { VocabularyAvailabilityStore } from './vocabulary-availability.store';

describe('VocabularyAvailabilityStore', () => {
  beforeEach(() => {
    configureVocabularyTestBed();
  });

  it('starts without claiming anything about the vocabulary', () => {
    expect(TestBed.inject(VocabularyAvailabilityStore).state()).toEqual({ kind: 'unknown' });
  });

  it('reports no vocabulary before anything has been committed', async () => {
    const store = TestBed.inject(VocabularyAvailabilityStore);

    await store.refresh();

    expect(store.state()).toEqual({ kind: 'known', availability: 'none' });
  });

  /** A storage failure is not "you have no words": it is "this could not be read". */
  it('reports a failed read as unavailable, with the reason', async () => {
    TestBed.overrideProvider(VOCABULARY_REPOSITORY, {
      useValue: {
        getActiveSnapshot: (): Promise<Result<VocabularySnapshot | null, StorageError>> =>
          Promise.resolve(err(storageError('unavailable', 'The database could not be opened.'))),
      },
    });
    const store = TestBed.inject(VocabularyAvailabilityStore);

    await store.refresh();

    expect(store.state()).toEqual({
      kind: 'unavailable',
      message: 'The database could not be opened.',
    });
  });

  it('re-reads on demand rather than caching the first answer', async () => {
    const store = TestBed.inject(VocabularyAvailabilityStore);
    await store.refresh();
    expect(store.state()).toEqual({ kind: 'known', availability: 'none' });

    const repository = TestBed.inject(VOCABULARY_REPOSITORY);
    const active = snapshotId('44444444-4444-4444-8444-444444444444');
    await repository.commitSnapshot({
      snapshot: {
        id: active,
        createdAt: 1,
        status: 'complete',
        uniqueEntryCount: 0,
        sourceIds: [],
        sourceKinds: [],
        analyzerVersion: 'test',
        normalizationVersion: 'test',
        stats: {
          sourcesQueried: 0,
          entriesRead: 0,
          nonEmptyValues: 0,
          rejectedEmptyValues: 0,
          duplicateOccurrences: 0,
          uniqueExpressions: 0,
          sourceWarnings: [],
        },
      },
      items: [],
      provenance: [],
      sources: [],
      caches: [],
    });
    await store.refresh();

    expect(store.state()).toEqual({ kind: 'known', availability: 'empty' });
  });
});
