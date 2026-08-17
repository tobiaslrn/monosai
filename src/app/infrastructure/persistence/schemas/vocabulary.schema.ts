import { z } from 'zod';
import {
  nonEmptyString,
  rowVersionSchema,
  snapshotIdSchema,
  sourceMappingIdSchema,
  timestampSchema,
  vocabularyItemIdSchema,
} from './common.schema';

export const providerKindSchema = z.enum(['desktop-connect', 'android-connect', 'package']);

export const vocabularySnapshotRowSchema = z.object({
  v: rowVersionSchema,
  id: snapshotIdSchema,
  createdAt: timestampSchema,
  status: z.literal('complete'),
  uniqueEntryCount: z.number().int().nonnegative(),
  mappingIds: z.array(nonEmptyString).readonly(),
  providerKinds: z.array(providerKindSchema).readonly(),
  analyzerVersion: nonEmptyString,
  normalizationVersion: nonEmptyString,
  stats: z.object({
    mappingsQueried: z.number().int().nonnegative(),
    reviewedEligibleNotes: z.number().int().nonnegative(),
    nonEmptyValues: z.number().int().nonnegative(),
    rejectedEmptyValues: z.number().int().nonnegative(),
    duplicateOccurrences: z.number().int().nonnegative(),
    uniqueExpressions: z.number().int().nonnegative(),
    providerWarnings: z.array(z.string()).readonly(),
  }),
});

export const vocabularyItemRowSchema = z.object({
  v: rowVersionSchema,
  id: vocabularyItemIdSchema,
  snapshotId: snapshotIdSchema,
  visibleExpression: nonEmptyString,
  canonicalExpression: nonEmptyString,
  expressionHash: nonEmptyString,
  analyzedSequence: z
    .array(
      z.object({
        surface: z.string(),
        lemma: z.string().optional(),
        readingHiragana: z.string().optional(),
      }),
    )
    .readonly(),
});

export const vocabularyProvenanceRowSchema = z.object({
  id: z.number().int().optional(),
  v: rowVersionSchema,
  vocabularyItemId: vocabularyItemIdSchema,
  sourceMappingId: nonEmptyString,
  deckName: nonEmptyString,
  noteTypeName: nonEmptyString,
  fieldName: nonEmptyString,
  sourceNoteId: z.string().optional(),
});

export const sourceMappingRowSchema = z.object({
  v: rowVersionSchema,
  id: sourceMappingIdSchema,
  providerKind: providerKindSchema,
  deckName: nonEmptyString,
  deckScope: z.enum(['deck-only', 'deck-and-subdecks']),
  noteTypeName: nonEmptyString,
  expressionFieldName: nonEmptyString,
  enabled: z.boolean(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export type VocabularySnapshotRow = z.infer<typeof vocabularySnapshotRowSchema>;
export type VocabularyItemRow = z.infer<typeof vocabularyItemRowSchema>;
export type VocabularyProvenanceRow = z.infer<typeof vocabularyProvenanceRowSchema>;
export type SourceMappingRow = z.infer<typeof sourceMappingRowSchema>;
