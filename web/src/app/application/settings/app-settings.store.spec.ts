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
