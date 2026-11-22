import type { Result } from '../shared/result';
import type { StorageError } from '../storage/storage-error';
import type {
  AppSettings,
  ExceptionPolicy,
  GenerationSettings,
  LanguageAssetSettings,
  ReaderPreferences,
  TextModelSettings,
  TtsSettings,
} from './settings';

/**
 * A change to one settings row: the fields to set, or a function that works
 * them out from the row as it is stored at the moment of writing.
 *
 * The function form is for a change to a list in the row, such as the presets
 * or the failed tests. Building the list from an in-memory copy would drop
 * whatever another write saved after that copy was read; the function sees
 * the latest stored row instead, inside the same transaction as the write.
 * It must be synchronous and free of side effects.
 */
export type SettingsPatch<T> = Partial<T> | ((current: T) => Partial<T>);

/**
 * Settings are separated by concern so a change to one area cannot invalidate
 * another through a single unvalidated JSON blob.
 */
export interface SettingsRepository {
  getAppSettings(): Promise<Result<AppSettings, StorageError>>;
  updateAppSettings(patch: Partial<AppSettings>): Promise<Result<AppSettings, StorageError>>;

  getReaderPreferences(): Promise<Result<ReaderPreferences, StorageError>>;
  updateReaderPreferences(
    patch: Partial<ReaderPreferences>,
  ): Promise<Result<ReaderPreferences, StorageError>>;

  getGenerationSettings(): Promise<Result<GenerationSettings, StorageError>>;
  updateGenerationSettings(
    patch: Partial<GenerationSettings>,
  ): Promise<Result<GenerationSettings, StorageError>>;

  getTextModelSettings(): Promise<Result<TextModelSettings, StorageError>>;
  updateTextModelSettings(
    patch: SettingsPatch<TextModelSettings>,
  ): Promise<Result<TextModelSettings, StorageError>>;

  getTtsSettings(): Promise<Result<TtsSettings, StorageError>>;
  updateTtsSettings(patch: SettingsPatch<TtsSettings>): Promise<Result<TtsSettings, StorageError>>;

  getExceptionPolicy(): Promise<Result<ExceptionPolicy, StorageError>>;
  updateExceptionPolicy(policy: ExceptionPolicy): Promise<Result<ExceptionPolicy, StorageError>>;

  getLanguageAssetSettings(): Promise<Result<LanguageAssetSettings, StorageError>>;
  updateLanguageAssetSettings(
    patch: Partial<LanguageAssetSettings>,
  ): Promise<Result<LanguageAssetSettings, StorageError>>;
}
