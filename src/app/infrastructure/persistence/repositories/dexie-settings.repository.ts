import type { ZodType } from 'zod';
import type { Clock } from '../../../domain/shared/clock';
import { ok, type Result } from '../../../domain/shared/result';
import type { SettingsRepository } from '../../../domain/settings/settings-repository';
import {
  DEFAULT_APP_SETTINGS,
  DEFAULT_EXCEPTION_POLICY,
  DEFAULT_LANGUAGE_ASSET_SETTINGS,
  DEFAULT_READER_PREFERENCES,
  DEFAULT_TEXT_MODEL_SETTINGS,
  DEFAULT_TTS_SETTINGS,
  type AppSettings,
  type ExceptionPolicy,
  type LanguageAssetSettings,
  type ReaderPreferences,
  type TextModelSettings,
  type TtsSettings,
} from '../../../domain/settings/settings';
import type { StorageError } from '../../../domain/storage/storage-error';
import type { MonosaiDatabase } from '../monosai-db';
import { parseRecord } from '../record-validation';
import { ROW_VERSION } from '../schemas/common.schema';
import {
  SETTINGS_KEYS,
  appSettingsSchema,
  exceptionPolicySchema,
  languageAssetSettingsSchema,
  readerPreferencesSchema,
  textModelSettingsSchema,
  ttsSettingsSchema,
  type SettingsKey,
} from '../schemas/settings.schema';
import { runStorage, runStorageWithRules, StorageRuleViolation } from './storage-operation';

/**
 * Settings persistence. Each concern has its own validated row so one corrupt
 * or unknown value cannot invalidate unrelated settings.
 */
export class DexieSettingsRepository implements SettingsRepository {
  constructor(
    private readonly db: MonosaiDatabase,
    private readonly clock: Clock,
  ) {}

  getAppSettings(): Promise<Result<AppSettings, StorageError>> {
    return this.read(SETTINGS_KEYS.app, appSettingsSchema, DEFAULT_APP_SETTINGS);
  }

  updateAppSettings(patch: Partial<AppSettings>): Promise<Result<AppSettings, StorageError>> {
    return this.write(SETTINGS_KEYS.app, appSettingsSchema, DEFAULT_APP_SETTINGS, patch, true);
  }

  getReaderPreferences(): Promise<Result<ReaderPreferences, StorageError>> {
    return this.read(
      SETTINGS_KEYS.readerPreferences,
      readerPreferencesSchema,
      DEFAULT_READER_PREFERENCES,
    );
  }

  updateReaderPreferences(
    patch: Partial<ReaderPreferences>,
  ): Promise<Result<ReaderPreferences, StorageError>> {
    return this.write(
      SETTINGS_KEYS.readerPreferences,
      readerPreferencesSchema,
      DEFAULT_READER_PREFERENCES,
      patch,
      true,
    );
  }

  getTextModelSettings(): Promise<Result<TextModelSettings, StorageError>> {
    return this.read(SETTINGS_KEYS.textModel, textModelSettingsSchema, DEFAULT_TEXT_MODEL_SETTINGS);
  }

  updateTextModelSettings(
    patch: Partial<TextModelSettings>,
  ): Promise<Result<TextModelSettings, StorageError>> {
    return this.write(
      SETTINGS_KEYS.textModel,
      textModelSettingsSchema,
      DEFAULT_TEXT_MODEL_SETTINGS,
      patch,
      false,
    );
  }

  getTtsSettings(): Promise<Result<TtsSettings, StorageError>> {
    return this.read(SETTINGS_KEYS.tts, ttsSettingsSchema, DEFAULT_TTS_SETTINGS);
  }

  updateTtsSettings(patch: Partial<TtsSettings>): Promise<Result<TtsSettings, StorageError>> {
    return this.write(SETTINGS_KEYS.tts, ttsSettingsSchema, DEFAULT_TTS_SETTINGS, patch, false);
  }

  getExceptionPolicy(): Promise<Result<ExceptionPolicy, StorageError>> {
    return this.read(
      SETTINGS_KEYS.exceptionPolicy,
      exceptionPolicySchema,
      DEFAULT_EXCEPTION_POLICY,
    );
  }

  updateExceptionPolicy(policy: ExceptionPolicy): Promise<Result<ExceptionPolicy, StorageError>> {
    return this.write(
      SETTINGS_KEYS.exceptionPolicy,
      exceptionPolicySchema,
      DEFAULT_EXCEPTION_POLICY,
      policy,
      true,
    );
  }

  getLanguageAssetSettings(): Promise<Result<LanguageAssetSettings, StorageError>> {
    return this.read(
      SETTINGS_KEYS.languageAssets,
      languageAssetSettingsSchema,
      DEFAULT_LANGUAGE_ASSET_SETTINGS,
    );
  }

  updateLanguageAssetSettings(
    patch: Partial<LanguageAssetSettings>,
  ): Promise<Result<LanguageAssetSettings, StorageError>> {
    return this.write(
      SETTINGS_KEYS.languageAssets,
      languageAssetSettingsSchema,
      DEFAULT_LANGUAGE_ASSET_SETTINGS,
      patch,
      false,
    );
  }

  private async read<T>(
    key: SettingsKey,
    schema: ZodType<T>,
    fallback: T,
  ): Promise<Result<T, StorageError>> {
    const loaded = await runStorage(`settings.get(${key})`, () => this.db.settings.get(key));
    if (!loaded.ok) {
      return loaded;
    }
    if (!loaded.value) {
      return ok(fallback);
    }
    return parseRecord(schema, loaded.value.value, `settings:${key}`);
  }

  /**
   * Merges a patch into one settings row.
   *
   * The read and the write are one transaction because a patch describes a
   * field, not a record: two of them in flight at once would otherwise both
   * merge onto the same stored copy, and the second write would silently drop
   * whatever the first one had just saved. Overlapping writes to a row are rare
   * but entirely reachable — choosing a model runs a test that stores its
   * result while the learner is already editing the next field.
   */
  private write<T extends object>(
    key: SettingsKey,
    schema: ZodType<T>,
    fallback: T,
    patch: Partial<T>,
    touchUpdatedAt: boolean,
  ): Promise<Result<T, StorageError>> {
    return runStorageWithRules(`settings.write(${key})`, () =>
      this.db.transaction('rw', this.db.settings, async () => {
        const loaded = await this.db.settings.get(key);
        const current = loaded ? parseRecord(schema, loaded.value, `settings:${key}`) : ok(fallback);
        if (!current.ok) {
          throw new StorageRuleViolation(current.error);
        }

        const merged: T = {
          ...current.value,
          ...patch,
          ...(touchUpdatedAt ? { updatedAt: this.clock.now() } : {}),
        };

        const validated = parseRecord(schema, merged, `settings:${key}`);
        if (!validated.ok) {
          throw new StorageRuleViolation(validated.error);
        }

        await this.db.settings.put({ key, v: ROW_VERSION, value: validated.value });
        return validated.value;
      }),
    );
  }
}
