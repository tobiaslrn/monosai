import type { FailedConfigurationTest } from '../ai/failed-configuration-test';
import type { StructuredOutputMode } from '../ai/model-test';
import type { SpeechInstructionsSupport } from '../ai/speech-instructions';
import type { SnapshotId } from '../shared/ids';
import type { PreparationLayer } from '../enrichment/preparation';

export type ThemeSetting = 'system' | 'light' | 'dark';
export type AnkiWordPriorityMode = 'uniform' | 'recent' | 'difficult';
export type VocabularyStrictness = 'relaxed' | 'standard' | 'strict';

export const DEFAULT_ANKI_CONNECT_PORT = 8_765;

export function isValidAnkiConnectPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65_535;
}

export interface AppSettings {
  readonly helpIntroSeen: boolean;
  readonly theme: ThemeSetting;
  readonly activeSnapshotId: SnapshotId | null;
  readonly ankiConnectPort: number;
  readonly ankiWordPriorityMode: AnkiWordPriorityMode;
  readonly updatedAt: number;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  helpIntroSeen: false,
  theme: 'system',
  activeSnapshotId: null,
  ankiConnectPort: DEFAULT_ANKI_CONNECT_PORT,
  ankiWordPriorityMode: 'uniform',
  updatedAt: 0,
};

/** Generation choices captured once so an in-flight story cannot change beneath the learner. */
export interface GenerationSettings {
  readonly vocabularyStrictness: VocabularyStrictness;
  readonly defaultPreparationTargets: readonly PreparationLayer[];
  readonly updatedAt: number;
}

export const DEFAULT_GENERATION_SETTINGS: GenerationSettings = {
  vocabularyStrictness: 'standard',
  defaultPreparationTargets: ['english', 'grammar'],
  updatedAt: 0,
};

export function repairBudgetFor(strictness: VocabularyStrictness): number {
  switch (strictness) {
    case 'relaxed':
      return 0;
    case 'standard':
      return 1;
    case 'strict':
      return 2;
  }
}

/**
 * The bounds of the reader's text scale.
 *
 * Line height and paragraph spacing follow the scale, so the smallest setting
 * still has whitespace a sentence can be pressed in and the largest does not
 * push a single sentence past a screen.
 */
export const MIN_TEXT_SCALE = 0.8;
export const MAX_TEXT_SCALE = 2.5;
export const TEXT_SCALE_STEP = 0.05;

/**
 * Global reader aids, applied to every reading on this device.
 *
 * There is no preference for showing translations or grammar: the reading
 * surface shows Japanese, and every piece of English is something the learner
 * opened deliberately.
 */
export interface ReaderPreferences {
  readonly furigana: boolean;
  readonly tokenSpacing: boolean;
  /** Underlines for unreviewed vocabulary and unfamiliar grammar only. */
  readonly warningMarkers: boolean;
  /** Multiplier over the base reading font size, within the bounds above. */
  readonly textScale: number;
  readonly updatedAt: number;
}

export const DEFAULT_READER_PREFERENCES: ReaderPreferences = {
  furigana: true,
  tokenSpacing: true,
  warningMarkers: true,
  textScale: 1,
  updatedAt: 0,
};

/** Keeps a scale from settings, a URL, or an old row inside the usable range. */
export function clampTextScale(scale: number): number {
  if (!Number.isFinite(scale)) {
    return DEFAULT_READER_PREFERENCES.textScale;
  }
  return Math.min(MAX_TEXT_SCALE, Math.max(MIN_TEXT_SCALE, scale));
}

/**
 * A request's completion budget includes hidden reasoning and the visible
 * structured reply. It is deliberately bounded so a typo cannot turn one
 * generation into an unbounded spend. Every model uses one: the story model
 * stores its own on the settings row, and each routed model may override it.
 */
export const MIN_STORY_TOKEN_BUDGET = 4_096;
export const MAX_STORY_TOKEN_BUDGET = 32_768;
export const DEFAULT_STORY_TOKEN_BUDGET = 16_384;

export function isValidStoryTokenBudget(value: number): boolean {
  return (
    Number.isInteger(value) && value >= MIN_STORY_TOKEN_BUDGET && value <= MAX_STORY_TOKEN_BUDGET
  );
}

export interface TextModelSettings {
  readonly failedTests?: readonly FailedConfigurationTest[];
  readonly modelId: string;
  readonly reasoningEffort: string | null;
  readonly storyTokenBudget: number;
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
  readonly activePresetId: string | null;
  /** Optional dedicated model for grammar judgement; null falls back to the text default. */
  readonly grammarPresetId?: string | null;
  /** Optional dedicated model for translation; null falls back to the story model. */
  readonly translationPresetId?: string | null;
  readonly presets: readonly TextModelPreset[];
  readonly favoriteModelIds?: readonly string[];
}

export interface TextModelPreset {
  readonly id: string;
  readonly name: string;
  readonly modelId: string;
  readonly reasoningEffort: string | null;
  /** Completion budget for this model; null follows the story budget. */
  readonly tokenBudget?: number | null;
  readonly lastTestFingerprint?: string | null;
  readonly lastTestedAt?: number | null;
  readonly structuredOutput?: StructuredOutputMode | null;
}

export const DEFAULT_TEXT_MODEL_SETTINGS: TextModelSettings = {
  failedTests: [],
  modelId: '',
  reasoningEffort: null,
  storyTokenBudget: DEFAULT_STORY_TOKEN_BUDGET,
  lastTestFingerprint: null,
  lastTestedAt: null,
  structuredOutput: null,
  activePresetId: null,
  grammarPresetId: null,
  translationPresetId: null,
  presets: [],
  favoriteModelIds: [],
};

export interface TtsSettings {
  readonly failedTests?: readonly FailedConfigurationTest[];
  readonly modelId: string;
  readonly voiceId: string;
  readonly speed: number;
  /**
   * Whether the configuration test saw the speed parameter honoured.
   *
   * Measured, never assumed: with `speechInstructions`, this is the pair the
   * synthesis path reads to decide which channels the pace may travel through.
   */
  readonly speedSupported: boolean;
  readonly speechInstructions?: SpeechInstructionsSupport;
  readonly lastTestFingerprint: string | null;
  readonly lastTestedAt: number | null;
  readonly activePresetId: string | null;
  readonly presets: readonly TtsPreset[];
  readonly favoriteModelIds?: readonly string[];
}

export interface TtsPreset {
  readonly id: string;
  readonly name: string;
  readonly modelId: string;
  readonly voiceId: string;
  readonly speed: number;
  readonly speedSupported?: boolean;
  readonly speechInstructions?: SpeechInstructionsSupport;
  readonly lastTestFingerprint?: string | null;
  readonly lastTestedAt?: number | null;
}

export const DEFAULT_TTS_SETTINGS: TtsSettings = {
  failedTests: [],
  modelId: '',
  voiceId: '',
  speed: 1,
  speedSupported: false,
  speechInstructions: 'unsupported',
  lastTestFingerprint: null,
  lastTestedAt: null,
  activePresetId: null,
  presets: [],
  favoriteModelIds: [],
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
