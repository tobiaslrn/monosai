import {
  ApplicationRef,
  EnvironmentInjector,
  createEnvironmentInjector,
  runInInjectionContext,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { snapshotFixture } from '../../../testing/persistence-fixtures';
import {
  configureVocabularyTestBed,
  type VocabularyTestBed,
} from '../../../testing/vocabulary-fakes';
import { unmeasuredBasis } from '../../domain/anki/practice-evidence';
import { vocabularySourceId } from '../../domain/shared/ids';
import { storageError } from '../../domain/storage/storage-error';
import type {
  TextListVocabularySource,
  VocabularySourceCache,
} from '../../domain/vocabulary/vocabulary-source';
import { SnapshotHistoryStore } from './snapshot-history.store';
import { SourceMappingStore } from './source-mapping.store';
import { SourceStandingStore } from './source-standing.store';

const FIRST: TextListVocabularySource = {
  id: vocabularySourceId('22222222-2222-4222-8222-222222222222'),
  kind: 'text-list',
  label: 'My textbook',
  content: 'ねこ\n犬',
  enabled: true,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  lastSyncedAt: null,
};

const SECOND: TextListVocabularySource = {
  ...FIRST,
  id: vocabularySourceId('33333333-3333-4333-8333-333333333333'),
  label: 'Another list',
};

function cacheFor(
  source: TextListVocabularySource,
  words: readonly string[],
  readAt: number,
): VocabularySourceCache {
  return {
    sourceId: source.id,
    refreshedAt: readAt,
    entries: words.map((rawValue) => ({ rawValue })),
    warnings: [],
    practice: unmeasuredBasis(readAt),
  };
}

describe('SourceStandingStore', () => {
  let beds: VocabularyTestBed;
  let reads: number;

  beforeEach(async () => {
    beds = configureVocabularyTestBed();
    beds.mappings.stored.set(FIRST.id, FIRST);
    beds.mappings.caches.set(FIRST.id, cacheFor(FIRST, ['ねこ', '犬'], 5));
    const readCaches = beds.mappings.readCaches.bind(beds.mappings);
    reads = 0;
    beds.mappings.readCaches = (ids) => {
      reads += 1;
      return readCaches(ids);
    };
    await TestBed.inject(SourceMappingStore).load();
  });

  /** A screen showing the numbers: following ends when its injector is destroyed. */
  function showScreen(): EnvironmentInjector {
    const screen = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector));
    runInInjectionContext(screen, () => {
      TestBed.inject(SourceStandingStore).follow();
    });
    return screen;
  }

  async function settle(): Promise<void> {
    TestBed.tick();
    await TestBed.inject(ApplicationRef).whenStable();
  }

  it('reads nothing while no screen is showing the numbers', async () => {
    const standings = TestBed.inject(SourceStandingStore);
    await settle();

    expect(reads).toBe(0);
    expect(standings.standingFor(FIRST.id)).toBeNull();
    expect(standings.lastReadAt()).toBeNull();
  });

  it('gives each source its last complete read once a screen follows', async () => {
    const standings = TestBed.inject(SourceStandingStore);
    showScreen();
    await settle();

    expect(standings.standingFor(FIRST.id)).toEqual({ entryCount: 2, readAt: 5 });
    expect(standings.lastReadAt()).toBe(5);
    expect(reads).toBe(1);
  });

  it('reads once however many screens follow', async () => {
    showScreen();
    showScreen();
    await settle();

    expect(reads).toBe(1);
  });

  it('reads again when the list of sources changes', async () => {
    const standings = TestBed.inject(SourceStandingStore);
    showScreen();
    await settle();
    beds.mappings.stored.set(SECOND.id, SECOND);
    beds.mappings.caches.set(SECOND.id, cacheFor(SECOND, ['魚'], 9));

    await TestBed.inject(SourceMappingStore).load();
    await settle();

    expect(standings.standingFor(SECOND.id)).toEqual({ entryCount: 1, readAt: 9 });
    expect(standings.lastReadAt()).toBe(9);
    expect(reads).toBe(2);
  });

  it('reads again when a new vocabulary is current, because a source read changes its cache', async () => {
    const standings = TestBed.inject(SourceStandingStore);
    const history = TestBed.inject(SnapshotHistoryStore);
    const commit = snapshotFixture(1).snapshot;
    beds.vocabulary.snapshots.push(commit);
    beds.vocabulary.activeSnapshotId = commit.id;
    await history.load();
    showScreen();
    await settle();
    expect(standings.standingFor(FIRST.id)?.entryCount).toBe(2);

    beds.mappings.caches.set(FIRST.id, cacheFor(FIRST, ['ねこ', '犬', '魚'], 8));
    beds.vocabulary.snapshots.splice(0, 1, { ...commit });
    await history.load();
    await settle();

    expect(standings.standingFor(FIRST.id)).toEqual({ entryCount: 3, readAt: 8 });
  });

  it('stops reading once the last screen has gone', async () => {
    const standings = TestBed.inject(SourceStandingStore);
    const first = showScreen();
    const second = showScreen();
    await settle();

    first.destroy();
    beds.mappings.stored.set(SECOND.id, SECOND);
    beds.mappings.caches.set(SECOND.id, cacheFor(SECOND, ['魚'], 9));
    await TestBed.inject(SourceMappingStore).load();
    await settle();
    expect(standings.standingFor(SECOND.id)).not.toBeNull();

    second.destroy();
    const after = reads;
    beds.mappings.stored.delete(SECOND.id);
    await TestBed.inject(SourceMappingStore).load();
    await settle();

    expect(reads).toBe(after);
  });

  it('keeps the numbers it has when a read fails, rather than reporting a failure', async () => {
    const standings = TestBed.inject(SourceStandingStore);
    showScreen();
    await settle();
    // Shown, as it is on a screen, before the read that fails.
    expect(standings.standingFor(FIRST.id)?.entryCount).toBe(2);
    beds.mappings.stored.set(SECOND.id, SECOND);
    beds.mappings.readCaches = () =>
      Promise.resolve({ ok: false, error: storageError('unavailable', 'The database is closed.') });

    await TestBed.inject(SourceMappingStore).load();
    await settle();

    expect(standings.standingFor(FIRST.id)).toEqual({ entryCount: 2, readAt: 5 });
  });

  it('clears the numbers when no source is left', async () => {
    const standings = TestBed.inject(SourceStandingStore);
    showScreen();
    await settle();

    beds.mappings.stored.clear();
    await TestBed.inject(SourceMappingStore).load();
    await settle();

    expect(standings.standingFor(FIRST.id)).toBeNull();
    expect(standings.lastReadAt()).toBeNull();
  });
});
