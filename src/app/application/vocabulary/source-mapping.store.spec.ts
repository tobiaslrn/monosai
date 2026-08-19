import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  configureVocabularyTestBed,
  type VocabularyTestBed,
} from '../../../testing/vocabulary-fakes';
import { storageError } from '../../domain/storage/storage-error';
import { SourceMappingStore, type NewMapping } from './source-mapping.store';

const BASIC: NewMapping = {
  providerKind: 'package',
  deckName: 'Core Japanese',
  deckScope: 'deck-only',
  noteTypeName: 'Basic',
  expressionFieldName: 'Expression',
};

describe('SourceMappingStore', () => {
  let beds: VocabularyTestBed;
  let store: SourceMappingStore;

  beforeEach(() => {
    beds = configureVocabularyTestBed();
    store = TestBed.inject(SourceMappingStore);
  });

  it('starts empty and unloaded', () => {
    expect(store.mappings()).toEqual([]);
    expect(store.loaded()).toBe(false);
    expect(store.hasEnabled()).toBe(false);
  });

  it('adds a mapping enabled by default', async () => {
    const added = await store.add(BASIC);

    expect(added).not.toBeNull();
    expect(store.mappings()).toHaveLength(1);
    expect(store.mappings()[0].enabled).toBe(true);
    expect(store.hasEnabled()).toBe(true);
  });

  it('persists what it added', async () => {
    await store.add(BASIC);
    await store.load();

    expect(store.loaded()).toBe(true);
    expect(store.mappings()[0].deckName).toBe('Core Japanese');
  });

  it('allows two mappings on one deck with different note types', async () => {
    await store.add(BASIC);
    await store.add({ ...BASIC, noteTypeName: 'Sentence', expressionFieldName: 'Front' });

    expect(store.mappings()).toHaveLength(2);
  });

  it('updates a mapping in place', async () => {
    const added = await store.add(BASIC);
    if (added === null) return;

    await store.update(added.id, { expressionFieldName: 'Meaning' });

    expect(store.mappings()[0].expressionFieldName).toBe('Meaning');
    expect(store.mappings()).toHaveLength(1);
  });

  it('ignores an update to a mapping that is gone', async () => {
    const added = await store.add(BASIC);
    if (added === null) return;
    await store.remove(added.id);

    expect(await store.update(added.id, { deckName: 'Other' })).toBeNull();
  });

  it('toggles enablement without removing the mapping', async () => {
    const added = await store.add(BASIC);
    if (added === null) return;

    await store.setEnabled(added.id, false);

    expect(store.mappings()).toHaveLength(1);
    expect(store.enabled()).toHaveLength(0);
    expect(store.hasEnabled()).toBe(false);
  });

  it('removes a mapping', async () => {
    const added = await store.add(BASIC);
    if (added === null) return;

    await store.remove(added.id);

    expect(store.mappings()).toEqual([]);
    expect(beds.mappings.stored.size).toBe(0);
  });

  it('keeps showing what is stored when a write fails', async () => {
    await store.add(BASIC);
    beds.mappings.saveFailure = storageError('quota', 'Storage is full.');

    const added = await store.add({ ...BASIC, noteTypeName: 'Sentence' });

    expect(added).toBeNull();
    expect(store.mappings()).toHaveLength(1);
    expect(store.lastFailure()?.code).toBe('quota');
  });

  it('clears the failure after a later write succeeds', async () => {
    beds.mappings.saveFailure = storageError('quota', 'Storage is full.');
    await store.add(BASIC);
    expect(store.lastFailure()).not.toBeNull();

    beds.mappings.saveFailure = null;
    await store.add(BASIC);

    expect(store.lastFailure()).toBeNull();
  });

  it('reports a failed load without clearing what it holds', async () => {
    await store.add(BASIC);
    expect(store.mappings()).toHaveLength(1);
  });
});
