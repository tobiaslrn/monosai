import { Injectable, computed, inject, signal } from '@angular/core';
import {
  DEFAULT_APP_SETTINGS,
  DEFAULT_READER_PREFERENCES,
  isRecentFocusSize,
  isValidAnkiConnectPort,
  type AppSettings,
  type AnkiWordPriorityMode,
  type ReaderPreferences,
  type RecentFocusSize,
  type ThemeSetting,
} from '../../domain/settings/settings';
import type { StorageError } from '../../domain/storage/storage-error';
import { SETTINGS_REPOSITORY } from '../shared/repository-tokens';

/**
 * Device-wide settings and reader aids.
 *
 * Preferences are global by design: changing one updates every open and future
 * reading. Nothing here is stored per reading.
 */
@Injectable({ providedIn: 'root' })
export class AppSettingsStore {
  private readonly repository = inject(SETTINGS_REPOSITORY);

  private readonly appSettings = signal<AppSettings>(DEFAULT_APP_SETTINGS);
  private readonly preferences = signal<ReaderPreferences>(DEFAULT_READER_PREFERENCES);
  private readonly failure = signal<StorageError | null>(null);
  private readerPreferenceWriteQueue = Promise.resolve();
  private readerPreferenceWriteVersion = 0;

  readonly theme = computed(() => this.appSettings().theme);
  readonly helpIntroSeen = computed(() => this.appSettings().helpIntroSeen);

  async markHelpIntroSeen(): Promise<boolean> {
    const saved = await this.repository.updateAppSettings({ helpIntroSeen: true });
    if (!saved.ok) {
      this.failure.set(saved.error);
      return false;
    }
    this.appSettings.set(saved.value);
    this.failure.set(null);
    return true;
  }
  readonly activeSnapshotId = computed(() => this.appSettings().activeSnapshotId);
  readonly ankiConnectPort = computed(() => this.appSettings().ankiConnectPort);
  readonly ankiWordPriorityMode = computed(() => this.appSettings().ankiWordPriorityMode);
  readonly recentFocusSize = computed(() => this.appSettings().recentFocusSize);
  readonly readerPreferences = this.preferences.asReadonly();
  readonly lastFailure = this.failure.asReadonly();

  /** Loads persisted settings during bootstrap. Failures are fatal for startup. */
  async load(): Promise<void> {
    const settings = await this.repository.getAppSettings();
    if (!settings.ok) {
      this.failure.set(settings.error);
      throw new Error(settings.error.message);
    }
    this.appSettings.set(settings.value);

    const preferences = await this.repository.getReaderPreferences();
    if (!preferences.ok) {
      this.failure.set(preferences.error);
      throw new Error(preferences.error.message);
    }
    this.preferences.set(preferences.value);
  }

  /**
   * Re-reads the settings row.
   *
   * Replacing the current vocabulary sets its snapshot identity inside the
   * same transaction that writes it, so this store's copy is stale afterwards.
   * Re-reading rather than assuming the new id keeps the one source of truth in
   * the database.
   */
  async reloadAppSettings(): Promise<void> {
    const settings = await this.repository.getAppSettings();
    if (!settings.ok) {
      this.failure.set(settings.error);
      return;
    }
    this.appSettings.set(settings.value);
    this.failure.set(null);
  }

  setTheme(theme: ThemeSetting): Promise<void> {
    return this.saveAppSettings({ theme });
  }

  async setAnkiConnectPort(port: number): Promise<void> {
    if (!isValidAnkiConnectPort(port)) {
      return;
    }
    await this.saveAppSettings({ ankiConnectPort: port });
  }

  async setAnkiWordPriorityMode(mode: AnkiWordPriorityMode): Promise<void> {
    if (!['uniform', 'recent', 'difficult'].includes(mode)) {
      return;
    }
    await this.saveAppSettings({ ankiWordPriorityMode: mode });
  }

  async setRecentFocusSize(size: RecentFocusSize): Promise<void> {
    if (!isRecentFocusSize(size)) {
      return;
    }
    await this.saveAppSettings({ recentFocusSize: size });
  }

  /** Applies a patch optimistically and rolls it back if the write fails. */
  private async saveAppSettings(patch: Partial<Omit<AppSettings, 'updatedAt'>>): Promise<void> {
    const previous = this.appSettings();
    this.appSettings.set({ ...previous, ...patch });

    const saved = await this.repository.updateAppSettings(patch);
    if (saved.ok) {
      this.appSettings.set(saved.value);
      this.failure.set(null);
    } else {
      this.appSettings.set(previous);
      this.failure.set(saved.error);
    }
  }

  /**
   * Writes one reader preference.
   *
   * Generic over the key so a boolean aid and the numeric text scale share one
   * optimistic write-and-roll-back path instead of two.
   */
  async setReaderPreference<K extends keyof Omit<ReaderPreferences, 'updatedAt'>>(
    preference: K,
    value: ReaderPreferences[K],
  ): Promise<void> {
    const previous = this.preferences();
    const writeVersion = ++this.readerPreferenceWriteVersion;
    this.preferences.set({ ...previous, [preference]: value });

    const write = this.readerPreferenceWriteQueue.then(async () => {
      const saved = await this.repository.updateReaderPreferences({ [preference]: value });
      // A newer optimistic value owns the signal. The queue still lets this
      // write finish before the next one reaches persistence, but its result
      // must not repaint the UI with an older value.
      if (writeVersion !== this.readerPreferenceWriteVersion) {
        return;
      }
      if (saved.ok) {
        this.preferences.set(saved.value);
        this.failure.set(null);
      } else {
        this.preferences.set(previous);
        this.failure.set(saved.error);
      }
    });
    this.readerPreferenceWriteQueue = write.catch(() => undefined);
    await write;
  }
}
