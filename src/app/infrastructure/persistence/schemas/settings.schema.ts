import { z } from 'zod';
import { MAX_TEXT_SCALE, MIN_TEXT_SCALE } from '../../../domain/settings/settings';
import { nonEmptyString, snapshotIdSchema, timestampSchema } from './common.schema';

export const appSettingsSchema = z.object({
  theme: z.enum(['system', 'light', 'dark']),
  activeSnapshotId: snapshotIdSchema.nullable(),
  updatedAt: timestampSchema,
});

export const readerPreferencesSchema = z.object({
  furigana: z.boolean(),
  tokenSpacing: z.boolean(),
  warningMarkers: z.boolean(),
  textScale: z.number().min(MIN_TEXT_SCALE).max(MAX_TEXT_SCALE),
  updatedAt: timestampSchema,
});

export const textModelSettingsSchema = z.object({
  modelId: z.string(),
  reasoningEffort: z.string().nullable().default(null),
  lastTestFingerprint: z.string().nullable(),
  lastTestedAt: timestampSchema.nullable(),
  // Recorded by a successful test so generation opens in the mode this model
  // is known to honour. Null whenever no test currently vouches for it, which
  // is also what a row written before the field existed means: an absent value
  // is the untested state, so it is defaulted rather than treated as corrupt.
  structuredOutput: z.enum(['native-schema', 'json-contract']).nullable().default(null),
  activePresetId: z.string().nullable().default(null),
  presets: z
    .array(
      z.object({
        id: nonEmptyString,
        name: nonEmptyString,
        modelId: nonEmptyString,
        reasoningEffort: z.string().nullable(),
      }),
    )
    .readonly()
    .default([]),
});

export const ttsSettingsSchema = z.object({
  modelId: z.string(),
  voiceId: z.string(),
  speed: z.number().positive().max(4),
  lastTestFingerprint: z.string().nullable(),
  lastTestedAt: timestampSchema.nullable(),
  activePresetId: z.string().nullable().default(null),
  presets: z
    .array(
      z.object({
        id: nonEmptyString,
        name: nonEmptyString,
        modelId: nonEmptyString,
        voiceId: nonEmptyString,
        speed: z.number().positive().max(4),
      }),
    )
    .readonly()
    .default([]),
});

export const exceptionPolicySchema = z.object({
  text: z.string(),
  policyHash: z.string(),
  updatedAt: timestampSchema,
});

export const languageAssetSettingsSchema = z.object({
  tokenizerVersion: z.string().nullable(),
  dictionaryVersion: z.string().nullable(),
  grammarPresetsVersion: z.string().nullable(),
  structuralBaselineVersion: z.string().nullable(),
});

export const credentialRowSchema = z.object({
  key: z.literal('openrouter'),
  v: z.number().int().positive(),
  apiKey: nonEmptyString,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const SETTINGS_KEYS = {
  app: 'app',
  readerPreferences: 'reader-preferences',
  textModel: 'text-model',
  tts: 'tts',
  exceptionPolicy: 'exception-policy',
  languageAssets: 'language-assets',
} as const;

export type SettingsKey = (typeof SETTINGS_KEYS)[keyof typeof SETTINGS_KEYS];
