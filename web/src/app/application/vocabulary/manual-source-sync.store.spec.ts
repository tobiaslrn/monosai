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
import { storageError } from '../../domain/storage/storage-error';
import type { AnkiVocabularySource } from '../../domain/vocabulary/vocabulary-source';
import { ANKI_PROVIDER_FACTORY } from '../shared/anki-tokens';
import { ManualSourceSyncStore } from './manual-source-sync.store';

/**
 * Sync now, and what it must never cost.
 *
 * The point of a manual sync is that a learner who turned automatic syncing off
 * still has a way to update. The point of these tests is the other half: a
 * failed, cancelled, or suspiciously empty read must leave the vocabulary that
 * is already there exactly as it was.
 */
describe('ManualSourceSyncStore', () => {
  let beds: VocabularyTestBed;
  let store: ManualSourceSyncStore;
  let providerFactory: () => AnkiVocabularyProvider;

  beforeEach(() => {
    beds = configureVocabularyTestBed();
    providerFactory = () => new FakeAnkiProvider(CONTRACT_COLLECTION, { kind: 'desktop-connect' });
    TestBed.configureTestingModule({
      providers: [{ provide: ANKI_PROVIDER_FACTORY, useValue: () => providerFactory() }],
    });
    store = TestBed.inject(ManualSourceSyncStore);
  });

  function configureSource(automaticSync = false): AnkiVocabularySource {
    const source = mappingFor({
      kind: 'anki-connect',
      providerKind: 'desktop-connect',
      automaticSync,
    });
    beds.mappings.stored.set(source.id, source);
    return source;
  }

  it('reads a source on demand even when it is not synced automatically', async () => {
    const source = configureSource(false);

    await store.syncNow(source);

    expect(store.state().kind).toBe('complete');
    expect(beds.vocabulary.commitCount).toBe(1);
    expect(beds.mappings.caches.get(source.id)?.entries.length).toBeGreaterThan(0);
  });

  it('announces the result with the number the learner can check', async () => {
    const source = configureSource();

    await store.syncNow(source);

    expect(store.announcement()).toContain('unique expressions');
    expect(store.isSyncingSource(source.id)).toBe(false);
  });

  it('keeps the previous vocabulary and offers the failure when Anki is unreachable', async () => {
    const source = configureSource();
    await store.syncNow(source);
    const committedBefore = beds.vocabulary.commitCount;
    const snapshotBefore = beds.vocabulary.snapshots[0];

    providerFactory = () =>
      new FakeAnkiProvider(CONTRACT_COLLECTION, {
        kind: 'desktop-connect',
        probeError: ankiError('not-running', 'Monosai could not reach AnkiConnect.'),
      });
    store.dismiss();
    await store.syncNow(source);

    expect(store.state().kind).toBe('failed');
    expect(store.failureFor(source.id)?.code).toBe('not-running');
    expect(beds.vocabulary.commitCount).toBe(committedBefore);
    expect(beds.vocabulary.snapshots[0]).toBe(snapshotBefore);
  });

  /** A commit that aborts is the one failure that could have half-written. */
  it('leaves the active vocabulary untouched when the commit fails', async () => {
    const source = configureSource();
    await store.syncNow(source);
    const snapshotBefore = beds.vocabulary.snapshots[0];

    beds.vocabulary.commitFailure = storageError('transaction-aborted', 'The write was aborted.');
    store.dismiss();
    await store.syncNow(source);

    expect(store.state().kind).toBe('failed');
    expect(store.announcement()).toContain('unchanged');
    expect(beds.vocabulary.snapshots[0]).toBe(snapshotBefore);
  });

  /**
   * A deck that reads as empty is nearly always a half-open collection, not a
   * learner who deleted every card, so it is refused rather than committed.
   */
  it('refuses a read that would empty a source that had words', async () => {
    const source = configureSource();
    await store.syncNow(source);
    const before = beds.vocabulary.snapshots[0].uniqueEntryCount;
    expect(before).toBeGreaterThan(0);

    providerFactory = () =>
      new FakeAnkiProvider({ ...CONTRACT_COLLECTION, notes: [] }, { kind: 'desktop-connect' });
    store.dismiss();
    await store.syncNow(source);

    expect(store.state().kind).toBe('failed');
    expect(store.failureFor(source.id)?.message).toContain('no vocabulary');
    expect(beds.vocabulary.snapshots[0].uniqueEntryCount).toBe(before);
  });

  it('reports a cancellation as saving nothing', async () => {
    const source = configureSource();

    const running = store.syncNow(source);
    store.cancel();
    await running;

    expect(store.state().kind).toBe('cancelled');
    expect(store.announcement()).toContain('unchanged');
    expect(beds.vocabulary.commitCount).toBe(0);
  });

  it('runs one sync at a time', async () => {
    const source = configureSource();

    const first = store.syncNow(source);
    await store.syncNow(source);
    await first;

    expect(beds.vocabulary.commitCount).toBe(1);
  });

  it('does nothing for a source that has no live connection to read again', async () => {
    const source = mappingFor({ kind: 'anki-package', providerKind: 'package' });
    beds.mappings.stored.set(source.id, source);

    await store.syncNow(source);

    expect(store.state().kind).toBe('idle');
    expect(beds.vocabulary.commitCount).toBe(0);
  });
});
