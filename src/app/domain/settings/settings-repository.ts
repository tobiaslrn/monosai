import type { Result } from '../shared/result';
import type { StorageError } from '../storage/storage-error';
import type {
  AppSettings,
  ExceptionPolicy,
  LanguageAssetSettings,
  ReaderPreferences,
  TextModelSettings,
  TtsSettings,
} from './settings';

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

  getTextModelSettings(): Promise<Result<TextModelSettings, StorageError>>;
  updateTextModelSettings(
    patch: Partial<TextModelSettings>,
  ): Promise<Result<TextModelSettings, StorageError>>;

  getTtsSettings(): Promise<Result<TtsSettings, StorageError>>;
  updateTtsSettings(patch: Partial<TtsSettings>): Promise<Result<TtsSettings, StorageError>>;

  getExceptionPolicy(): Promise<Result<ExceptionPolicy, StorageError>>;
  updateExceptionPolicy(policy: ExceptionPolicy): Promise<Result<ExceptionPolicy, StorageError>>;

  getLanguageAssetSettings(): Promise<Result<LanguageAssetSettings, StorageError>>;
  updateLanguageAssetSettings(
    patch: Partial<LanguageAssetSettings>,
  ): Promise<Result<LanguageAssetSettings, StorageError>>;
}
