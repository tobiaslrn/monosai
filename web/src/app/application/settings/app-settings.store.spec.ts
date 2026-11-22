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

describe('AppSettingsStore alpha preference', () => {
  it('loads the persisted flag and only changes it after a successful save', async () => {
    const saved = { ...DEFAULT_APP_SETTINGS, alphaNoticeSeen: true };
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

    expect(store.alphaNoticeSeen()).toBe(false);
    expect(await store.markAlphaNoticeSeen()).toBe(false);
    expect(store.alphaNoticeSeen()).toBe(false);
    expect(await store.markAlphaNoticeSeen()).toBe(true);
    expect(store.alphaNoticeSeen()).toBe(true);
    expect(repository.updateAppSettings).toHaveBeenLastCalledWith({ alphaNoticeSeen: true });
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

describe('AppSettingsStore reader preferences', () => {
  function configure(updateReaderPreferences: ReturnType<typeof vi.fn>): AppSettingsStore {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SETTINGS_REPOSITORY,
          useValue: {
            getAppSettings: vi.fn().mockResolvedValue(ok(DEFAULT_APP_SETTINGS)),
            getReaderPreferences: vi.fn().mockResolvedValue(ok(DEFAULT_READER_PREFERENCES)),
            updateReaderPreferences,
          },
        },
      ],
    });
    return TestBed.inject(AppSettingsStore);
  }

  it('keeps the latest optimistic value while rapid writes settle in order', async () => {
    const releases: ((result: ReturnType<typeof ok>) => void)[] = [];
    const update = vi.fn(
      () =>
        new Promise((resolve) => {
          releases.push(resolve);
        }),
    );
    const store = configure(update);
    await store.load();

    const first = store.setReaderPreference('playbackRate', 0.9);
    const second = store.setReaderPreference('playbackRate', 0.8);
    const third = store.setReaderPreference('playbackRate', 1);

    expect(store.readerPreferences().playbackRate).toBe(1);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(update).toHaveBeenCalledTimes(1);

    releases[0]?.(ok({ ...DEFAULT_READER_PREFERENCES, playbackRate: 0.9 }));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(update).toHaveBeenCalledTimes(2);
    releases[1]?.(ok({ ...DEFAULT_READER_PREFERENCES, playbackRate: 0.8 }));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(update).toHaveBeenCalledTimes(3);
    releases[2]?.(ok({ ...DEFAULT_READER_PREFERENCES, playbackRate: 1 }));

    await Promise.all([first, second, third]);
    expect(store.readerPreferences().playbackRate).toBe(1);
    expect(update).toHaveBeenNthCalledWith(1, { playbackRate: 0.9 });
    expect(update).toHaveBeenNthCalledWith(2, { playbackRate: 0.8 });
    expect(update).toHaveBeenNthCalledWith(3, { playbackRate: 1 });
  });
});

describe('AppSettingsStore startup failure', () => {
  it('keeps the storage error when loading fails', async () => {
    const failure = storageError('migration-failed', 'The stored database could not be upgraded.');
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SETTINGS_REPOSITORY,
          useValue: { getAppSettings: vi.fn().mockResolvedValue(err(failure)) },
        },
      ],
    });

    await expect(TestBed.inject(AppSettingsStore).load()).rejects.toMatchObject({
      storageError: failure,
    });
  });
});

describe('AppSettingsStore overlapping writes', () => {
  it('shows what is stored after two quick changes that both fail to save', async () => {
    const unavailable = err(storageError('unavailable', 'Unavailable'));
    const repository = {
      getAppSettings: vi.fn().mockResolvedValue(ok(DEFAULT_APP_SETTINGS)),
      getReaderPreferences: vi.fn().mockResolvedValue(ok(DEFAULT_READER_PREFERENCES)),
      updateAppSettings: vi.fn().mockResolvedValue(unavailable),
      updateReaderPreferences: vi.fn().mockResolvedValue(unavailable),
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: SETTINGS_REPOSITORY, useValue: repository }],
    });
    const store = TestBed.inject(AppSettingsStore);
    await store.load();

    // The second change starts while the first is still being written.
    await Promise.all([store.setTheme('dark'), store.setAnkiWordPriorityMode('recent')]);
    await Promise.all([
      store.setReaderPreference('playbackRate', 0.9),
      store.setReaderPreference('playbackRate', 0.8),
    ]);

    expect(store.lastFailure()?.code).toBe('unavailable');
    expect(store.ankiWordPriorityMode()).toBe(DEFAULT_APP_SETTINGS.ankiWordPriorityMode);
    expect(store.theme()).toBe(DEFAULT_APP_SETTINGS.theme);
    expect(store.readerPreferences().playbackRate).toBe(DEFAULT_READER_PREFERENCES.playbackRate);
  });

  it('keeps showing a change still being written when an earlier one fails', async () => {
    let finishSecond: (result: unknown) => void = () => undefined;
    const update = vi
      .fn()
      .mockResolvedValueOnce(err(storageError('unavailable', 'Unavailable')))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishSecond = resolve;
          }),
      );
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SETTINGS_REPOSITORY,
          useValue: {
            getAppSettings: vi.fn().mockResolvedValue(ok(DEFAULT_APP_SETTINGS)),
            getReaderPreferences: vi.fn().mockResolvedValue(ok(DEFAULT_READER_PREFERENCES)),
            updateAppSettings: update,
          },
        },
      ],
    });
    const store = TestBed.inject(AppSettingsStore);
    await store.load();

    const first = store.setTheme('dark');
    const second = store.setAnkiWordPriorityMode('recent');
    await first;

    expect(store.theme()).toBe(DEFAULT_APP_SETTINGS.theme);
    expect(store.ankiWordPriorityMode()).toBe('recent');
    expect(store.lastFailure()?.code).toBe('unavailable');

    finishSecond(ok({ ...DEFAULT_APP_SETTINGS, ankiWordPriorityMode: 'recent' }));
    await second;
    expect(store.ankiWordPriorityMode()).toBe('recent');
  });
});
