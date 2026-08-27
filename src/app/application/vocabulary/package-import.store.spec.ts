import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { FakeAnkiProvider, type FakeProviderOptions } from '../../../testing/anki-fakes';
import type { FixtureCollection } from '../../../testing/anki-collection';
import {
  configureVocabularyTestBed,
  type VocabularyTestBed,
} from '../../../testing/vocabulary-fakes';
import { ankiError } from '../../domain/anki/anki-error';
import type { PackageSource } from '../../domain/anki/anki-provider';
import { vocabularySourceId } from '../../domain/shared/ids';
import { storageError } from '../../domain/storage/storage-error';
import type { SourceMapping } from '../../domain/vocabulary/source-mapping';
import type { VocabularySource } from '../../domain/vocabulary/vocabulary-source';
import { PACKAGE_PROVIDER_FACTORY } from '../shared/anki-tokens';
import { AppBusyRegistry } from '../shared/app-busy.registry';
import { PackageImportStore } from './package-import.store';
import { SourceMappingStore } from './source-mapping.store';

/** One deck with subdecks and one obvious expression field. */
const SHARED_DECK: FixtureCollection = {
  deckNames: ['Japanese', 'Japanese::Verbs'],
  noteTypes: [{ name: 'Basic', fieldNames: ['Expression', 'Meaning'] }],
  notes: [
    {
      id: 'n-neko',
      noteTypeName: 'Basic',
      fieldValues: ['ねこ', 'cat'],
      cards: [{ deckName: 'Japanese', reps: 3 }],
    },
    {
      id: 'n-taberu',
      noteTypeName: 'Basic',
      fieldValues: ['食べる', 'to eat'],
      cards: [{ deckName: 'Japanese::Verbs', reps: 2 }],
    },
  ],
};

/** Two top-level decks, so the deck cannot be settled without asking. */
const TWO_DECKS: FixtureCollection = {
  deckNames: ['Japanese', 'Spanish'],
  noteTypes: [{ name: 'Basic', fieldNames: ['Expression', 'Meaning'] }],
  notes: [
    {
      id: 'n-neko',
      noteTypeName: 'Basic',
      fieldValues: ['ねこ', 'cat'],
      cards: [{ deckName: 'Japanese', reps: 3 }],
    },
    {
      id: 'n-gato',
      noteTypeName: 'Basic',
      fieldValues: ['gato', 'cat'],
      cards: [{ deckName: 'Spanish', reps: 3 }],
    },
  ],
};

const FILE: PackageSource = {
  fileName: 'japanese.apkg',
  bytes: () => Promise.resolve(new ArrayBuffer(0)),
};

function storedPackageSource(overrides: Partial<SourceMapping> = {}): SourceMapping {
  return {
    id: vocabularySourceId('99999999-9999-4999-8999-999999999999'),
    kind: 'anki-package',
    label: 'Anki · Japanese · Expression',
    providerKind: 'package',
    deckName: 'Japanese',
    deckScope: 'deck-and-subdecks',
    noteTypeName: 'Basic',
    expressionFieldName: 'Expression',
    enabled: true,
    createdAt: 100,
    updatedAt: 100,
    lastSyncedAt: 100,
    automaticSync: false,
    ...overrides,
  };
}

describe('PackageImportStore', () => {
  let beds: VocabularyTestBed;
  let provider: FakeAnkiProvider;

  function configure(
    collection: FixtureCollection = SHARED_DECK,
    options: FakeProviderOptions = {},
  ): void {
    beds = configureVocabularyTestBed();
    provider = new FakeAnkiProvider(collection, { kind: 'package', ...options });
    TestBed.configureTestingModule({
      providers: [
        PackageImportStore,
        { provide: PACKAGE_PROVIDER_FACTORY, useValue: () => provider },
      ],
    });
  }

  async function seed(...sources: VocabularySource[]): Promise<void> {
    for (const source of sources) {
      beds.mappings.stored.set(source.id, source);
    }
    await TestBed.inject(SourceMappingStore).load();
  }

  function store(): PackageImportStore {
    return TestBed.inject(PackageImportStore);
  }

  beforeEach(() => {
    configure();
  });

  it('imports a single shared deck with its subdecks without asking', async () => {
    const importing = store();

    await importing.start(FILE);

    expect(importing.state().kind).toBe('complete');
    const state = importing.state();
    if (state.kind !== 'complete') return;
    expect(state.outcome).toEqual({
      deckName: 'Japanese',
      replaced: false,
      uniqueExpressions: 2,
    });
    const stored = [...beds.mappings.stored.values()];
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      kind: 'anki-package',
      deckName: 'Japanese',
      deckScope: 'deck-and-subdecks',
      expressionFieldName: 'Expression',
      automaticSync: false,
    });
  });

  it('replaces the source of a deck imported before, keeping one source', async () => {
    const existing = storedPackageSource({ enabled: false, createdAt: 42 });
    await seed(existing);

    await store().start(FILE);

    const stored = [...beds.mappings.stored.values()];
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ id: existing.id, createdAt: 42, enabled: true });
    const state = store().state();
    expect(state.kind === 'complete' && state.outcome.replaced).toBe(true);
  });

  it('leaves unrelated sources alone and combines them', async () => {
    const textList: VocabularySource = {
      id: vocabularySourceId('33333333-3333-4333-8333-333333333333'),
      kind: 'text-list',
      label: 'My textbook',
      content: '犬',
      enabled: true,
      createdAt: 1,
      updatedAt: 1,
      lastSyncedAt: 1,
    };
    const liveAnki = storedPackageSource({
      id: vocabularySourceId('44444444-4444-4444-8444-444444444444'),
      kind: 'anki-connect',
      providerKind: 'desktop-connect',
      automaticSync: true,
    });
    await seed(textList, liveAnki);
    beds.mappings.caches.set(textList.id, {
      sourceId: textList.id,
      refreshedAt: 1,
      entries: [{ rawValue: '犬' }],
      warnings: [],
    });

    await store().start(FILE);

    // The live source shares the deck name but is never replaced by a package.
    expect([...beds.mappings.stored.values()]).toHaveLength(3);
    expect(beds.mappings.stored.get(liveAnki.id)).toEqual(liveAnki);
    expect(beds.vocabulary.snapshots[0].uniqueEntryCount).toBe(3);
  });

  it('asks which deck to import when a collection carries several', async () => {
    configure(TWO_DECKS);
    const importing = store();

    await importing.start(FILE);

    expect(importing.state().kind).toBe('selecting');
    expect(beds.mappings.stored.size).toBe(0);

    importing.chooseDeck('Spanish');
    await importing.confirm();

    expect(importing.state().kind).toBe('complete');
    expect([...beds.mappings.stored.values()][0]).toMatchObject({ deckName: 'Spanish' });
  });

  it('writes nothing when the chooser is cancelled', async () => {
    configure(TWO_DECKS);
    const importing = store();
    await importing.start(FILE);

    importing.cancel();

    expect(importing.state().kind).toBe('cancelled');
    expect(beds.mappings.stored.size).toBe(0);
    expect(beds.vocabulary.snapshots).toHaveLength(0);
    expect(provider.disposed).toBe(true);
  });

  it('refuses a package with no review history and offers no retry', async () => {
    configure(SHARED_DECK, {
      capabilities: {
        limitations: [{ code: 'no-review-history', message: 'Nothing has been reviewed.' }],
      },
    });
    const importing = store();

    await importing.start(FILE);

    const state = importing.state();
    expect(state.kind).toBe('failed');
    if (state.kind !== 'failed') return;
    expect(state.error.code).toBe('package-review-data-missing');
    expect(state.canRetry).toBe(false);
    expect(beds.mappings.stored.size).toBe(0);
  });

  it('offers a retry for a failure that could pass next time', async () => {
    configure(SHARED_DECK, {
      probeError: ankiError('timeout', 'Reading the package took too long.'),
    });
    const importing = store();

    await importing.start(FILE);

    const state = importing.state();
    expect(state.kind === 'failed' && state.canRetry).toBe(true);
  });

  it('keeps the previous vocabulary when the commit fails', async () => {
    await seed(storedPackageSource());
    beds.vocabulary.commitFailure = storageError('quota', 'No room left.');

    await store().start(FILE);

    expect(store().state().kind).toBe('failed');
    expect(beds.vocabulary.snapshots).toHaveLength(0);
    // The source row is part of the same commit, so it did not change either.
    expect(beds.mappings.stored.get(storedPackageSource().id)?.lastSyncedAt).toBe(100);
  });

  it('imports a package the share sheet handed over, exactly once', async () => {
    beds.sharedInbox.waiting = {
      fileName: '日本語.apkg',
      receivedAt: 1,
      bytes: () => Promise.resolve(new ArrayBuffer(0)),
    };
    const importing = store();

    await importing.receiveShared('anki-package');

    expect(importing.state().kind).toBe('complete');
    expect([...beds.mappings.stored.values()]).toHaveLength(1);

    // The inbox is empty now, so a reload cannot import the same share again.
    importing.dismiss();
    await importing.receiveShared('anki-package');
    expect(importing.state().kind).toBe('failed');
    expect([...beds.mappings.stored.values()]).toHaveLength(1);
  });

  it('loads stored sources before planning an automatic shared import', async () => {
    const existing = storedPackageSource();
    beds.mappings.stored.set(existing.id, existing);
    beds.sharedInbox.waiting = {
      fileName: 'japanese.apkg',
      receivedAt: 1,
      bytes: () => Promise.resolve(new ArrayBuffer(0)),
    };

    await store().receiveShared('anki-package');

    expect([...beds.mappings.stored.values()]).toHaveLength(1);
    const state = store().state();
    expect(state.kind === 'complete' && state.outcome.replaced).toBe(true);
  });

  it('explains a share the worker could not accept, and keeps nothing waiting', async () => {
    beds.sharedInbox.waiting = {
      fileName: 'holiday.jpg',
      receivedAt: 1,
      bytes: () => Promise.resolve(new ArrayBuffer(0)),
    };
    const importing = store();

    await importing.receiveShared('anki-package-failed', 'too-large');

    const state = importing.state();
    expect(state.kind).toBe('failed');
    if (state.kind !== 'failed') return;
    expect(state.error.code).toBe('package-resource-limit');
    expect(state.canRetry).toBe(false);
    expect(beds.sharedInbox.waiting).toBeNull();
  });

  it('releases the provider and the busy reason when the page goes away', async () => {
    configure(TWO_DECKS);
    const busy = TestBed.inject(AppBusyRegistry);
    const importing = store();
    await importing.start(FILE);
    TestBed.tick();
    // A chooser waiting for an answer still holds the file, so an update that
    // reloads the page must not activate underneath it.
    expect(busy.isBusy()).toBe(true);

    importing.dispose();
    TestBed.tick();

    expect(provider.disposed).toBe(true);
    expect(busy.isBusy()).toBe(false);
  });
});
