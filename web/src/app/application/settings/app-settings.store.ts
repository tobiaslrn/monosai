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
import { StorageFailure, type StorageError } from '../../domain/storage/storage-error';
import { SETTINGS_REPOSITORY } from '../shared/repository-tokens';
import { OptimisticRow } from './optimistic-row';

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
  private readonly appSettingsRow = new OptimisticRow(this.appSettings);
  private readonly preferencesRow = new OptimisticRow(this.preferences);
  private readerPreferenceWriteQueue = Promise.resolve();

  readonly theme = computed(() => this.appSettings().theme);
  readonly helpIntroSeen = computed(() => this.appSettings().helpIntroSeen);
  readonly alphaNoticeSeen = computed(() => this.appSettings().alphaNoticeSeen);

  async markHelpIntroSeen(): Promise<boolean> {
    const saved = await this.repository.updateAppSettings({ helpIntroSeen: true });
    if (!saved.ok) {
      this.failure.set(saved.error);
      return false;
    }
    this.appSettingsRow.setStored(saved.value);
    this.failure.set(null);
    return true;
  }

  async markAlphaNoticeSeen(): Promise<boolean> {
    const saved = await this.repository.updateAppSettings({ alphaNoticeSeen: true });
    if (!saved.ok) {
      this.failure.set(saved.error);
      return false;
    }
    this.appSettingsRow.setStored(saved.value);
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
      throw new StorageFailure(settings.error);
    }
    this.appSettingsRow.setStored(settings.value);

    const preferences = await this.repository.getReaderPreferences();
    if (!preferences.ok) {
      this.failure.set(preferences.error);
      throw new StorageFailure(preferences.error);
    }
    this.preferencesRow.setStored(preferences.value);
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
    this.appSettingsRow.setStored(settings.value);
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

  /**
   * Shows a patch at once and takes it away again if the write fails, leaving
   * what is stored and any other change still being written.
   */
  private async saveAppSettings(patch: Partial<Omit<AppSettings, 'updatedAt'>>): Promise<void> {
    const saved = await this.appSettingsRow.write(patch, (change) =>
      this.repository.updateAppSettings(change),
    );
    this.failure.set(saved.ok ? null : saved.error);
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
    const patch: Partial<ReaderPreferences> = { [preference]: value };
    const saved = await this.preferencesRow.write(patch, (change) => {
      // Writes reach persistence one at a time, in the order they were made,
      // so the last change made is the one left stored.
      const write = this.readerPreferenceWriteQueue.then(() =>
        this.repository.updateReaderPreferences(change),
      );
      this.readerPreferenceWriteQueue = write.then(
        () => undefined,
        () => undefined,
      );
      return write;
    });
    this.failure.set(saved.ok ? null : saved.error);
  }
}
