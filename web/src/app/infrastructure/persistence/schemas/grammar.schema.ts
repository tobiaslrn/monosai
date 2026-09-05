import { z } from 'zod';
import {
  GRAMMAR_PRESET_IDS_EASIEST_FIRST,
  MAXIMUM_GUIDANCE_LENGTH,
  REGISTER_PREFERENCES,
} from '../../../domain/grammar/presets';
import { nonEmptyString, rowVersionSchema, timestampSchema } from './common.schema';

const presetIdSchema = z.enum(GRAMMAR_PRESET_IDS_EASIEST_FIRST);
const registerPreferenceSchema = z.enum(REGISTER_PREFERENCES);
const guidanceSchema = nonEmptyString.max(MAXIMUM_GUIDANCE_LENGTH);

/** Single-row store: the live profile is one preset, not a set of selections. */
export const grammarProfileRowSchema = z.object({
  v: rowVersionSchema,
  key: z.literal('profile'),
  presetId: presetIdSchema,
  registerPreference: registerPreferenceSchema,
  customGuidance: guidanceSchema.optional(),
  updatedAt: timestampSchema,
});

export const grammarProfileSnapshotRowSchema = z.object({
  v: rowVersionSchema,
  id: nonEmptyString,
  profileHash: nonEmptyString,
  capturedAt: timestampSchema,
  presetId: presetIdSchema,
  resolvedGuidance: nonEmptyString,
  registerPreference: registerPreferenceSchema,
  isCustomGuidance: z.boolean(),
  structuralBaselineVersion: nonEmptyString,
});

export type GrammarProfileRow = z.infer<typeof grammarProfileRowSchema>;
export type GrammarProfileSnapshotRow = z.infer<typeof grammarProfileSnapshotRowSchema>;
