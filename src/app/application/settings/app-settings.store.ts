import { Injectable, computed, inject, signal } from '@angular/core';
import {
  DEFAULT_APP_SETTINGS,
  DEFAULT_READER_PREFERENCES,
  type AppSettings,
  type ReaderPreferences,
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

  readonly theme = computed(() => this.appSettings().theme);
  readonly activeSnapshotId = computed(() => this.appSettings().activeSnapshotId);
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
   * Committing a vocabulary snapshot sets the active snapshot inside the same
   * transaction that writes it, so this store's copy is stale afterwards.
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

  async setTheme(theme: ThemeSetting): Promise<void> {
    const previous = this.appSettings();
    this.appSettings.set({ ...previous, theme });

    const saved = await this.repository.updateAppSettings({ theme });
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
    this.preferences.set({ ...previous, [preference]: value });

    const saved = await this.repository.updateReaderPreferences({ [preference]: value });
    if (saved.ok) {
      this.preferences.set(saved.value);
      this.failure.set(null);
    } else {
      this.preferences.set(previous);
      this.failure.set(saved.error);
    }
  }
}
