import { z } from 'zod';
import { nonEmptyString, snapshotIdSchema, timestampSchema } from './common.schema';

export const appSettingsSchema = z.object({
  theme: z.enum(['system', 'light', 'dark']),
  activeSnapshotId: snapshotIdSchema.nullable(),
  updatedAt: timestampSchema,
});

export const readerPreferencesSchema = z.object({
  furigana: z.boolean(),
  tokenSpacing: z.boolean(),
  statusMarkers: z.boolean(),
  translationsExpanded: z.boolean(),
  updatedAt: timestampSchema,
});

export const textModelSettingsSchema = z.object({
  modelId: z.string(),
  lastTestFingerprint: z.string().nullable(),
  lastTestedAt: timestampSchema.nullable(),
});

export const ttsSettingsSchema = z.object({
  modelId: z.string(),
  voiceId: z.string(),
  speed: z.number().positive().max(4),
  lastTestFingerprint: z.string().nullable(),
  lastTestedAt: timestampSchema.nullable(),
});

export const exceptionPolicySchema = z.object({
  text: z.string(),
  policyHash: z.string(),
  updatedAt: timestampSchema,
});

export const languageAssetSettingsSchema = z.object({
  tokenizerVersion: z.string().nullable(),
  dictionaryVersion: z.string().nullable(),
  grammarCatalogVersion: z.string().nullable(),
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
