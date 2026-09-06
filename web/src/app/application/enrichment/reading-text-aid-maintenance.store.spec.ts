import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { importedReadingFixture } from '../../../testing/persistence-fixtures';
import { ok } from '../../domain/shared/result';
import { ReaderStore } from '../reading/reader.store';
import { STORAGE_MAINTENANCE } from '../shared/repository-tokens';
import { PreparationStore } from './preparation.store';
import { ReadingTextAidMaintenanceStore } from './reading-text-aid-maintenance.store';

describe('ReadingTextAidMaintenanceStore', () => {
  const reading = importedReadingFixture().reading;
  const stopLayer = vi.fn(() => Promise.resolve(ok(undefined)));
  const clearReadingAid = vi.fn(() => Promise.resolve(ok(undefined)));
  const refreshSummaries = vi.fn(() => Promise.resolve());

  beforeEach(() => {
    stopLayer.mockClear();
    clearReadingAid.mockClear();
    refreshSummaries.mockClear();
    TestBed.configureTestingModule({
      providers: [
        ReadingTextAidMaintenanceStore,
        { provide: PreparationStore, useValue: { stopLayer } },
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
    expect(clearReadingAid).toHaveBeenCalledWith(reading.id, 'english');
    expect(refreshSummaries).toHaveBeenCalledOnce();
    expect(store.error()).toBeNull();
  });
});
