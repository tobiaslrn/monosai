import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { importedReadingFixture, uuid } from '../../../testing/persistence-fixtures';
import { sentenceId, type SentenceId } from '../../domain/shared/ids';
import { ok } from '../../domain/shared/result';
import { ReaderStore } from '../reading/reader.store';
import { STORAGE_MAINTENANCE } from '../shared/repository-tokens';
import { GrammarJobStore } from './grammar-job.store';
import { PreparationStore } from './preparation.store';
import { ReadingTextAidMaintenanceStore } from './reading-text-aid-maintenance.store';

describe('ReadingTextAidMaintenanceStore', () => {
  const reading = importedReadingFixture().reading;
  const stopLayer = vi.fn(() => Promise.resolve(ok(undefined)));
  const clearReadingAid = vi.fn(() => Promise.resolve(ok(undefined)));
  const refreshSummaries = vi.fn(() => Promise.resolve());
  const acknowledge = vi.fn();
  const grammarKeys: ReadonlyMap<SentenceId, string> = new Map([
    [sentenceId(uuid(1300)), 'current-grammar'],
  ]);
  const currentCacheKeys = vi.fn(() => Promise.resolve(ok(grammarKeys)));

  beforeEach(() => {
    stopLayer.mockClear();
    clearReadingAid.mockClear();
    refreshSummaries.mockClear();
    acknowledge.mockClear();
    currentCacheKeys.mockClear();
    TestBed.configureTestingModule({
      providers: [
        ReadingTextAidMaintenanceStore,
        { provide: PreparationStore, useValue: { stopLayer, acknowledge } },
        { provide: GrammarJobStore, useValue: { currentCacheKeys } },
        {
          provide: STORAGE_MAINTENANCE,
          useValue: { clearReadingAid },
        },
        {
          provide: ReaderStore,
          useValue: { reading: () => reading, refreshSummaries },
        },
      ],
    });
  });

  it('settles preparation before clearing only the selected text aid', async () => {
    const store = TestBed.inject(ReadingTextAidMaintenanceStore);

    await expect(store.clear('english')).resolves.toBe(true);

    expect(stopLayer).toHaveBeenCalledWith(reading.id, 'english');
    expect(clearReadingAid).toHaveBeenCalledWith(reading.id, 'english', null);
    expect(currentCacheKeys).not.toHaveBeenCalled();
    expect(acknowledge).toHaveBeenCalledWith(reading.id, 'english');
    expect(refreshSummaries).toHaveBeenCalledOnce();
    expect(store.error()).toBeNull();
  });

  it('clears grammar notes with the current keys, so notes another story uses still count', async () => {
    const store = TestBed.inject(ReadingTextAidMaintenanceStore);

    await expect(store.clear('grammar')).resolves.toBe(true);

    expect(currentCacheKeys).toHaveBeenCalledWith(reading.id);
    expect(clearReadingAid).toHaveBeenCalledWith(reading.id, 'grammar', grammarKeys);
    expect(refreshSummaries).toHaveBeenCalledOnce();
  });
});
