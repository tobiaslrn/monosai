import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_APP_SETTINGS, DEFAULT_READER_PREFERENCES } from '../../domain/settings/settings';
import { ok, err } from '../../domain/shared/result';
import { storageError } from '../../domain/storage/storage-error';
import { SETTINGS_REPOSITORY } from '../shared/repository-tokens';
import { AppSettingsStore } from './app-settings.store';

describe('AppSettingsStore Help preference', () => {
  it('loads the persisted flag and only changes it after a successful save', async () => {
    const saved = { ...DEFAULT_APP_SETTINGS, helpIntroSeen: true };
    const repository = {
      getAppSettings: vi.fn().mockResolvedValue(ok(DEFAULT_APP_SETTINGS)),
      getReaderPreferences: vi.fn().mockResolvedValue(ok(DEFAULT_READER_PREFERENCES)),
      updateAppSettings: vi
        .fn()
        .mockResolvedValueOnce(err(storageError('unavailable', 'Unavailable')))
        .mockResolvedValue(ok(saved)),
    };
    TestBed.configureTestingModule({
      providers: [{ provide: SETTINGS_REPOSITORY, useValue: repository }],
    });
    const store = TestBed.inject(AppSettingsStore);
    await store.load();
    expect(store.helpIntroSeen()).toBe(false);
    expect(await store.markHelpIntroSeen()).toBe(false);
    expect(store.helpIntroSeen()).toBe(false);
    expect(store.lastFailure()?.code).toBe('unavailable');
    expect(await store.markHelpIntroSeen()).toBe(true);
    expect(store.helpIntroSeen()).toBe(true);
    expect(store.lastFailure()).toBeNull();
    expect(repository.updateAppSettings).toHaveBeenLastCalledWith({ helpIntroSeen: true });
    repository.getAppSettings.mockResolvedValue(ok(saved));
    await store.load();
    expect(store.helpIntroSeen()).toBe(true);
  });
});

describe('AppSettingsStore focus size', () => {
  function configure(updateAppSettings: ReturnType<typeof vi.fn>): AppSettingsStore {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SETTINGS_REPOSITORY,
          useValue: {
            getAppSettings: vi.fn().mockResolvedValue(ok(DEFAULT_APP_SETTINGS)),
            getReaderPreferences: vi.fn().mockResolvedValue(ok(DEFAULT_READER_PREFERENCES)),
            updateAppSettings,
          },
        },
      ],
    });
    return TestBed.inject(AppSettingsStore);
  }

  it('starts at fifty and saves a new size', async () => {
    const update = vi.fn().mockResolvedValue(ok({ ...DEFAULT_APP_SETTINGS, recentFocusSize: 100 }));
    const store = configure(update);
    await store.load();
    expect(store.recentFocusSize()).toBe(50);

    await store.setRecentFocusSize(100);

    expect(update).toHaveBeenCalledWith({ recentFocusSize: 100 });
    expect(store.recentFocusSize()).toBe(100);
  });

  it('rolls back a size the repository refused', async () => {
    const store = configure(
      vi.fn().mockResolvedValue(err(storageError('unavailable', 'Unavailable'))),
    );
    await store.load();

    await store.setRecentFocusSize(25);

    expect(store.recentFocusSize()).toBe(50);
    expect(store.lastFailure()?.code).toBe('unavailable');
  });

  it('ignores a size outside the offered choices', async () => {
    const update = vi.fn();
    const store = configure(update);
    await store.load();

    await store.setRecentFocusSize(30 as never);

    expect(update).not.toHaveBeenCalled();
  });
});
