import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  configureVocabularyTestBed,
  type VocabularyTestBed,
} from '../../../testing/vocabulary-fakes';
import { storageError } from '../../domain/storage/storage-error';
import { ReaderWordListService } from './reader-word-list.service';
import { SourceMappingStore } from './source-mapping.store';

describe('ReaderWordListService', () => {
  let bed: VocabularyTestBed;
  beforeEach(() => {
    bed = configureVocabularyTestBed();
  });

  it('preserves Anki and serializes local additions into one included list', async () => {
    const anki = await TestBed.inject(SourceMappingStore).add({
      providerKind: 'desktop-connect',
      deckName: 'Japanese',
      deckScope: 'deck-only',
      noteTypeName: 'Words',
      expressionFieldName: 'Front',
    });
    const service = TestBed.inject(ReaderWordListService);
    const results = await Promise.all([service.add('猫'), service.add('犬'), service.add('猫')]);
    expect(results.every((result) => result.ok)).toBe(true);
    expect(bed.mappings.stored.get(anki!.id)).toEqual(anki);
    const lists = [...bed.mappings.stored.values()].filter((source) => source.kind === 'text-list');
    expect(lists).toHaveLength(1);
    expect(lists[0].content).toBe('猫\n犬');
    expect(bed.vocabulary.items.map((item) => item.visibleExpression)).toEqual(['猫', '犬']);
  });

  it('keeps the saved list, cache and vocabulary intact when commit fails', async () => {
    const service = TestBed.inject(ReaderWordListService);
    await service.add('猫');
    const sources = [...bed.mappings.stored.values()];
    const caches = [...bed.mappings.caches.values()];
    const items = [...bed.vocabulary.items];
    bed.vocabulary.commitFailure = storageError('quota', 'Storage is full.');
    expect((await service.add('犬')).ok).toBe(false);
    expect([...bed.mappings.stored.values()]).toEqual(sources);
    expect([...bed.mappings.caches.values()]).toEqual(caches);
    expect(bed.vocabulary.items).toEqual(items);
  });
});
