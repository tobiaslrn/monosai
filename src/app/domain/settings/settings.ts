import type { StructuredOutputMode } from '../ai/model-test';
import type { SnapshotId } from '../shared/ids';

export type ThemeSetting = 'system' | 'light' | 'dark';

export interface AppSettings {
  readonly theme: ThemeSetting;
  readonly activeSnapshotId: SnapshotId | null;
  readonly updatedAt: number;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  theme: 'system',
  activeSnapshotId: null,
  updatedAt: 0,
};

/** Global reader aids. All start enabled and apply to every reading. */
export interface ReaderPreferences {
  readonly furigana: boolean;
  readonly tokenSpacing: boolean;
  readonly statusMarkers: boolean;
  readonly translationsExpanded: boolean;
  readonly updatedAt: number;
}

export const DEFAULT_READER_PREFERENCES: ReaderPreferences = {
  furigana: true,
  tokenSpacing: true,
  statusMarkers: true,
  translationsExpanded: true,
  updatedAt: 0,
};

export interface TextModelSettings {
  readonly modelId: string;
  readonly lastTestFingerprint: string | null;
  readonly lastTestedAt: number | null;
  /**
   * The structured-output mode the last successful test proved.
   *
   * Persisted rather than rediscovered so generation opens with the mode this
   * model is known to honour instead of spending a format-recovery request
   * every run to learn it again. Null whenever no test currently vouches for
   * the configuration. See ADR 0020.
   */
  readonly structuredOutput: StructuredOutputMode | null;
}

export const DEFAULT_TEXT_MODEL_SETTINGS: TextModelSettings = {
  modelId: '',
  lastTestFingerprint: null,
  lastTestedAt: null,
  structuredOutput: null,
};

export interface TtsSettings {
  readonly modelId: string;
  readonly voiceId: string;
  readonly speed: number;
  readonly lastTestFingerprint: string | null;
  readonly lastTestedAt: number | null;
}

export const DEFAULT_TTS_SETTINGS: TtsSettings = {
  modelId: '',
  voiceId: '',
  speed: 1,
  lastTestFingerprint: null,
  lastTestedAt: null,
};

export interface ExceptionPolicy {
  readonly text: string;
  readonly policyHash: string;
  readonly updatedAt: number;
}

export const DEFAULT_EXCEPTION_POLICY: ExceptionPolicy = {
  text: '',
  policyHash: '',
  updatedAt: 0,
};

export interface LanguageAssetSettings {
  readonly tokenizerVersion: string | null;
  readonly dictionaryVersion: string | null;
  readonly grammarPresetsVersion: string | null;
  readonly structuralBaselineVersion: string | null;
}

export const DEFAULT_LANGUAGE_ASSET_SETTINGS: LanguageAssetSettings = {
  tokenizerVersion: null,
  dictionaryVersion: null,
  grammarPresetsVersion: null,
  structuralBaselineVersion: null,
};
