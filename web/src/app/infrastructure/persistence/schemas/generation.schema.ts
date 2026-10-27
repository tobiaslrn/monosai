import * as z from 'zod';
import { MAX_CUSTOM_OPTION_LENGTH } from '../../../domain/ai/story-direction-options';
import { countCodePoints } from '../../../domain/ai/story-request';
import {
  nonEmptyString,
  readingIdSchema,
  recentFocusSizeSchema,
  rowVersionSchema,
  sentenceIdSchema,
  snapshotIdSchema,
  timestampSchema,
  vocabularyItemIdSchema,
} from './common.schema';
import { tokenValidationSchema } from '../../language/token-validation.schema';

const storedTokenValidationSchema = tokenValidationSchema(vocabularyItemIdSchema);

export const frozenValidationRowSchema = z.object({
  v: rowVersionSchema,
  sentenceId: sentenceIdSchema,
  readingId: readingIdSchema,
  snapshotId: snapshotIdSchema,
  validatorVersion: nonEmptyString,
  tokenStatuses: z
    .array(z.object({ tokenId: nonEmptyString, validation: storedTokenValidationSchema }))
    .readonly(),
});

/**
 * One option label: the domain caps it in characters, which are code points,
 * so a label of emoji the form accepted is not refused here as too long.
 */
const optionLabelSchema = z
  .string()
  .min(1)
  .refine((value) => countCodePoints(value) <= MAX_CUSTOM_OPTION_LENGTH);

// `ending` and `time` were axes before ADR 0081. They stay valid so records
// written then still parse; no new record names them.
const storyAxisSchema = z.enum([
  'genre',
  'topic',
  'setting',
  'mood',
  'cast',
  'format',
  'ending',
  'time',
]);

/** At most two genres, one of every other axis; every value one short label. */
const axisValuesSchema = z.array(optionLabelSchema).min(1).max(2).readonly();

const storyDirectionRecordSchema = z.object({
  selected: z.partialRecord(storyAxisSchema, axisValuesSchema),
  customSelected: z.partialRecord(storyAxisSchema, axisValuesSchema).exactOptional(),
  frame: z.partialRecord(
    storyAxisSchema,
    z
      .array(z.object({ value: optionLabelSchema, rolled: z.boolean() }))
      .min(1)
      .max(2)
      .readonly(),
  ),
  turningPoint: nonEmptyString,
  plotEn: nonEmptyString,
  draftedPlotEn: nonEmptyString.exactOptional(),
});

export const generationProvenanceRowSchema = z.object({
  v: rowVersionSchema,
  id: nonEmptyString,
  readingId: readingIdSchema,
  snapshotId: snapshotIdSchema,
  grammarProfileSnapshotId: nonEmptyString,
  // Empty when the learner had configured no exception policy: an absent policy
  // is a real state, and rejecting it here would make it unrepresentable.
  exceptionPolicyHash: z.string(),
  modelId: nonEmptyString,
  promptVersions: z.record(z.string(), nonEmptyString),
  // Optional only for rows written before ADR 0046. Every new generation writes it.
  requestedSentenceCount: z.number().int().positive().exactOptional(),
  repairAttempts: z.number().int().min(0).max(2),
  suggestedVocabularyItemIds: z.array(vocabularyItemIdSchema).readonly(),
  ankiWordPriorityMode: z.enum(['uniform', 'recent', 'difficult']).default('uniform'),
  // Optional for the same reason as the fields below: an older row, or a story
  // written under another mode, legitimately has no focus. The table indexes
  // only `id` and `readingId`, so no Dexie version is needed.
  recentFocus: z
    .object({
      size: recentFocusSizeSchema,
      words: z
        .array(z.object({ expression: nonEmptyString, firstSeen: nonEmptyString }))
        .max(100)
        .readonly(),
    })
    .exactOptional(),
  // Both optional only for rows written before generation stopped producing
  // aids. Every new generation writes them, and no Dexie version is needed
  // because an older row legitimately lacks them — the same precedent
  // `requestedSentenceCount` set above.
  vocabularyStrictness: z.enum(['relaxed', 'standard', 'strict']).exactOptional(),
  preparationTargets: z
    .array(z.enum(['english', 'grammar', 'audio']))
    .readonly()
    .exactOptional(),
  // Optional for the same reason again: only stories whose premise was a plot
  // picked on the Plot step carry it (ADR 0080). The indexes are unchanged, so
  // no Dexie version is needed.
  storyDirection: storyDirectionRecordSchema.exactOptional(),
  createdAt: timestampSchema,
});

export type FrozenValidationRow = z.infer<typeof frozenValidationRowSchema>;
export type GenerationProvenanceRow = z.infer<typeof generationProvenanceRowSchema>;
