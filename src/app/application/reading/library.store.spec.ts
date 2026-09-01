import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fixedClock } from '../../domain/shared/clock';
import { readingId } from '../../domain/shared/ids';
import { FakeReadingMutationChannel } from '../../../testing/reading-mutation-channel-fake';
import { buildReading, FakeReadingRepository } from '../../../testing/reading-repository-fake';
import { CLOCK, READING_MUTATION_CHANNEL, READING_REPOSITORY } from '../shared/repository-tokens';
import { LibraryStore } from './library.store';

/**
 * The shelf as two tabs see it.
 *
 * Monosai is local-first, so two tabs on one database is ordinary, and a
 * deletion in either used to leave the other listing a reading that was gone
 * until it was navigated away and back.
 */
describe('LibraryStore across tabs', () => {
  let repository: FakeReadingRepository;
  let channel: FakeReadingMutationChannel;
  let store: LibraryStore;

  function configure(): LibraryStore {
    TestBed.resetTestingModule();
    repository = new FakeReadingRepository();
    channel = new FakeReadingMutationChannel();
    repository.add(buildReading({ id: 'r1', title: 'Reading one' }));
    repository.add(buildReading({ id: 'r2', title: 'Reading two' }));
    TestBed.configureTestingModule({
      providers: [
        LibraryStore,
        { provide: CLOCK, useValue: fixedClock(1_700_000_000_000) },
        { provide: READING_REPOSITORY, useValue: repository },
        { provide: READING_MUTATION_CHANNEL, useValue: channel },
      ],
    });
    return TestBed.inject(LibraryStore);
  }

  beforeEach(async () => {
    store = configure();
    await store.load();
  });

  it('tells the other tabs what it deleted, and names it', async () => {
    await store.delete(readingId('r1'));

    expect(channel.published).toEqual([
      { kind: 'reading-deleted', id: 'r1', title: 'Reading one' },
    ]);
  });

  it('names a reading this tab never listed, by reading it before deleting', async () => {
    // A deletion from the reader can happen with the shelf never loaded here.
    const unloaded = configure();

    await unloaded.delete(readingId('r2'));

    expect(channel.published).toEqual([
      { kind: 'reading-deleted', id: 'r2', title: 'Reading two' },
    ]);
  });

  it('drops a reading another tab deleted, without a reload', async () => {
    await repository.deleteReading(readingId('r1'));

    channel.deliver({ kind: 'reading-deleted', id: readingId('r1'), title: 'Reading one' });

    await vi.waitFor(() => {
      expect(store.items().map((reading) => reading.id)).toEqual(['r2']);
    });
    expect(store.announcement()).toBe('Reading one was deleted in another tab.');
  });

  it('leaves the shelf alone for a reading it was not showing', () => {
    channel.deliver({
      kind: 'reading-deleted',
      id: readingId('3f6d2c1a-9b4e-4a7d-8f21-0c5e7a9b1d33'),
      title: 'Somewhere else',
    });

    expect(store.items()).toHaveLength(2);
    expect(store.announcement()).toBe('');
  });

  it('says on the shelf what happened somewhere else', () => {
    store.noteExternalChange('Reading one was deleted in another tab.');

    expect(store.announcement()).toBe('Reading one was deleted in another tab.');
  });
});
