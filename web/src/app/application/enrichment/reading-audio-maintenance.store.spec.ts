import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { StorageMaintenance } from '../../domain/storage/storage-maintenance';
import { err, ok } from '../../domain/shared/result';
import { storageError } from '../../domain/storage/storage-error';
import { importedReadingFixture, uuid } from '../../../testing/persistence-fixtures';
import { sentenceId, type SentenceId } from '../../domain/shared/ids';
import { AudioPlaybackStore } from '../audio/audio-playback.store';
import { STORAGE_MAINTENANCE } from '../shared/repository-tokens';
import { AudioJobStore } from './audio-job.store';
import { ReadingAudioMaintenanceStore } from './reading-audio-maintenance.store';

describe('ReadingAudioMaintenanceStore', () => {
  const currentKeys: ReadonlyMap<SentenceId, string> = new Map([
    [sentenceId(uuid(1200)), 'current-audio'],
  ]);
  let maintenance: StorageMaintenance;
  let jobs: {
    readonly cancelAndWait: ReturnType<typeof vi.fn>;
    readonly currentCacheKeys: ReturnType<typeof vi.fn>;
  };
  let playback: {
    readonly readingAudioCleared: ReturnType<typeof vi.fn>;
    readonly prepare: ReturnType<typeof vi.fn>;
  };
  let clearReadingAudio: Mock<StorageMaintenance['clearReadingAudio']>;
  let readingAudioCleared: ReturnType<typeof vi.fn>;
  let store: ReadingAudioMaintenanceStore;

  beforeEach(() => {
    TestBed.resetTestingModule();
    clearReadingAudio = vi.fn<StorageMaintenance['clearReadingAudio']>(() =>
      Promise.resolve(ok(undefined)),
    );
    readingAudioCleared = vi.fn();
    maintenance = {
      getPersistenceStatus: vi.fn(),
      requestPersistence: vi.fn(),
      clearAudioCache: vi.fn(),
      clearReadingAudio,
      clearReadingAid: vi.fn(),
      exportData: vi.fn(),
      resetAllData: vi.fn(),
    };
    jobs = {
      cancelAndWait: vi.fn(() => Promise.resolve()),
      currentCacheKeys: vi.fn(() => Promise.resolve(ok(currentKeys))),
    };
    playback = {
      readingAudioCleared,
      prepare: vi.fn(() => Promise.resolve()),
    };
    TestBed.configureTestingModule({
      providers: [
        ReadingAudioMaintenanceStore,
        { provide: STORAGE_MAINTENANCE, useValue: maintenance },
        { provide: AudioJobStore, useValue: jobs },
        { provide: AudioPlaybackStore, useValue: playback },
      ],
    });
    store = TestBed.inject(ReadingAudioMaintenanceStore);
  });

  it('clears only the requested reading and reports completion', async () => {
    const reading = importedReadingFixture().reading;

    await expect(store.clear(reading)).resolves.toBe(true);

    expect(jobs.cancelAndWait).toHaveBeenCalledOnce();
    expect(readingAudioCleared).toHaveBeenCalledWith(reading.id);
    expect(jobs.currentCacheKeys).toHaveBeenCalledWith(reading.id);
    expect(clearReadingAudio).toHaveBeenCalledWith(reading.id, currentKeys);
    expect(store.state()).toBe('cleared');
    expect(store.error()).toBeNull();
  });

  it('keeps a typed failure visible until it is acknowledged', async () => {
    const reading = importedReadingFixture().reading;
    const failure = storageError('unavailable', 'The database was unavailable.');
    clearReadingAudio.mockResolvedValue(err(failure));

    await expect(store.clear(reading)).resolves.toBe(false);

    expect(store.state()).toBe('failed');
    expect(store.error()).toBe(failure);
    expect(playback.prepare).toHaveBeenCalledWith(reading);
    store.acknowledge();
    expect(store.state()).toBe('idle');
    expect(store.error()).toBeNull();
  });

  it('clears nothing when the current keys cannot be read', async () => {
    const reading = importedReadingFixture().reading;
    const failure = storageError('unavailable', 'The database was unavailable.');
    jobs.currentCacheKeys.mockResolvedValue(err(failure));

    await expect(store.clear(reading)).resolves.toBe(false);

    expect(clearReadingAudio).not.toHaveBeenCalled();
    expect(store.state()).toBe('failed');
    expect(store.error()).toBe(failure);
    expect(playback.prepare).toHaveBeenCalledWith(reading);
  });

  it('reports clearing while workers settle and coalesces another press', async () => {
    const reading = importedReadingFixture().reading;
    let release!: () => void;
    vi.mocked(jobs.cancelAndWait).mockReturnValue(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );

    const clearing = store.clear(reading);

    expect(store.state()).toBe('clearing');
    await expect(store.clear(reading)).resolves.toBe(false);
    expect(clearReadingAudio).not.toHaveBeenCalled();

    release();
    await expect(clearing).resolves.toBe(true);
    expect(clearReadingAudio).toHaveBeenCalledOnce();
  });
});
