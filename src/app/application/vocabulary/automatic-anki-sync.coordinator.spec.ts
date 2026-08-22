import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { CONTRACT_COLLECTION } from '../../../testing/anki-collection';
import { FakeAnkiProvider } from '../../../testing/anki-fakes';
import { mappingFor } from '../../../testing/anki-provider-contract';
import {
  configureVocabularyTestBed,
  type VocabularyTestBed,
} from '../../../testing/vocabulary-fakes';
import { ankiError } from '../../domain/anki/anki-error';
import type { AnkiVocabularyProvider } from '../../domain/anki/anki-provider';
import { ANKI_PROVIDER_FACTORY } from '../shared/anki-tokens';
import { AutomaticAnkiSyncCoordinator } from './automatic-anki-sync.coordinator';

describe('AutomaticAnkiSyncCoordinator', () => {
  let beds: VocabularyTestBed;
  let coordinator: AutomaticAnkiSyncCoordinator;
  let providerFactory: () => AnkiVocabularyProvider;
  let providerCreations: number;

  beforeEach(() => {
    beds = configureVocabularyTestBed();
    providerCreations = 0;
    providerFactory = () => new FakeAnkiProvider(CONTRACT_COLLECTION, { kind: 'desktop-connect' });
    TestBed.configureTestingModule({
      providers: [
        AutomaticAnkiSyncCoordinator,
        {
          provide: ANKI_PROVIDER_FACTORY,
          useValue: () => {
            providerCreations += 1;
            return providerFactory();
          },
        },
      ],
    });
    coordinator = TestBed.inject(AutomaticAnkiSyncCoordinator);
  });

  function configureAutomaticSource(): ReturnType<typeof mappingFor> {
    const source = mappingFor({
      kind: 'anki-connect',
      providerKind: 'desktop-connect',
      automaticSync: true,
    });
    beds.mappings.stored.set(source.id, source);
    return source;
  }

  it('refreshes opted-in Anki sources and commits the combined snapshot', async () => {
    const source = configureAutomaticSource();

    await coordinator.trigger(true);

    expect(coordinator.status().kind).toBe('updated');
    expect(beds.vocabulary.commitCount).toBe(1);
    expect(beds.mappings.caches.get(source.id)?.entries.length).toBeGreaterThan(0);
  });

  it('coalesces concurrent triggers and observes the cooldown', async () => {
    configureAutomaticSource();

    await Promise.all([coordinator.trigger(true), coordinator.trigger(true)]);
    await coordinator.trigger();

    expect(providerCreations).toBe(1);
    expect(beds.vocabulary.commitCount).toBe(1);
  });

  it('treats unavailable Anki as non-destructive', async () => {
    configureAutomaticSource();
    providerFactory = () =>
      new FakeAnkiProvider(CONTRACT_COLLECTION, {
        kind: 'desktop-connect',
        probeError: ankiError('not-running', 'Anki is not running.'),
      });

    await coordinator.trigger(true);

    expect(coordinator.status()).toMatchObject({ kind: 'waiting' });
    expect(beds.vocabulary.commitCount).toBe(0);
  });

  it('holds an unexpected empty replacement for review', async () => {
    const source = configureAutomaticSource();
    beds.mappings.caches.set(source.id, {
      sourceId: source.id,
      refreshedAt: 1,
      entries: [{ rawValue: '猫' }],
      warnings: [],
    });
    const emptyCollection = {
      ...CONTRACT_COLLECTION,
      notes: CONTRACT_COLLECTION.notes.map((note) => ({
        ...note,
        cards: note.cards.map((card) => ({ ...card, reps: 0 })),
      })),
    };
    providerFactory = () => new FakeAnkiProvider(emptyCollection, { kind: 'desktop-connect' });

    await coordinator.trigger(true);

    expect(coordinator.status()).toMatchObject({ kind: 'attention' });
    expect(beds.vocabulary.commitCount).toBe(0);
    expect(beds.mappings.caches.get(source.id)?.entries).toEqual([{ rawValue: '猫' }]);
  });
});
