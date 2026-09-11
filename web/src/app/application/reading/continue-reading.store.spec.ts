import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Reading } from '../../domain/reading/reading';
import { storageError } from '../../domain/storage/storage-error';
import { FakeReadingMutationChannel } from '../../../testing/reading-mutation-channel-fake';
import { FakeReadingRepository, buildReading } from '../../../testing/reading-repository-fake';
import { READING_MUTATION_CHANNEL, READING_REPOSITORY } from '../shared/repository-tokens';
import { ContinueReadingStore } from './continue-reading.store';

function opened(id: string, lastOpenedAt: number | null): Reading {
  return { ...buildReading({ id, title: `Reading ${id}` }).reading, lastOpenedAt };
}

describe('ContinueReadingStore', () => {
  let repository: FakeReadingRepository;
  let channel: FakeReadingMutationChannel;

  beforeEach(() => {
    repository = new FakeReadingRepository();
    channel = new FakeReadingMutationChannel();
    TestBed.configureTestingModule({
      providers: [
        ContinueReadingStore,
        { provide: READING_REPOSITORY, useValue: repository },
        { provide: READING_MUTATION_CHANNEL, useValue: channel },
      ],
    });
  });

  it('is loading until the repository answers', () => {
    expect(TestBed.inject(ContinueReadingStore).state()).toEqual({ kind: 'loading' });
  });

  it('offers nothing while no story has been opened', async () => {
    repository.readings = [opened('a', null)];
    const store = TestBed.inject(ContinueReadingStore);

    await store.load();

    expect(store.state()).toEqual({ kind: 'none' });
  });

  it('offers the story opened most recently', async () => {
    repository.readings = [opened('a', 2_000), opened('b', 3_000), opened('c', null)];
    const store = TestBed.inject(ContinueReadingStore);

    await store.load();

    const state = store.state();
    expect(state.kind === 'ready' && state.reading.id).toBe('b');
  });

  it('reports a lookup that failed', async () => {
    repository.failLastOpenedWith = storageError('unavailable', 'Storage is unavailable.');
    const store = TestBed.inject(ContinueReadingStore);

    await store.load();

    expect(store.state().kind).toBe('failed');
  });

  it('stops offering a story another tab deleted', async () => {
    repository.readings = [opened('a', 2_000), opened('b', 3_000)];
    const store = TestBed.inject(ContinueReadingStore);
    await store.load();

    repository.readings = [opened('a', 2_000)];
    channel.deliver({ kind: 'reading-deleted', id: repository.readings[0].id, title: 'x' });
    await Promise.resolve();
    expect(store.state().kind).toBe('ready');

    const deleted = buildReading({ id: 'b' }).reading.id;
    channel.deliver({ kind: 'reading-deleted', id: deleted, title: 'Reading b' });
    await new Promise((resolve) => setTimeout(resolve));

    const state = store.state();
    expect(state.kind === 'ready' && state.reading.id).toBe('a');
  });
});
