import { z } from 'zod';
import {
  nonEmptyString,
  rowVersionSchema,
  snapshotIdSchema,
  vocabularySourceIdSchema,
  timestampSchema,
  vocabularyItemIdSchema,
} from './common.schema';

export const providerKindSchema = z.enum(['desktop-connect', 'android-connect', 'package']);
export const sourceKindSchema = z.enum(['anki-connect', 'anki-package', 'text-list']);

const schedulingSignalsShape = {
  reps: z.number().int().positive().optional(),
  lapseRatio: z.number().min(0).max(1).optional(),
  easeFactor: z.number().positive().optional(),
};

export const vocabularySnapshotRowSchema = z.object({
  v: rowVersionSchema,
  id: snapshotIdSchema,
  createdAt: timestampSchema,
  status: z.literal('complete'),
  uniqueEntryCount: z.number().int().nonnegative(),
  sourceIds: z.array(vocabularySourceIdSchema).readonly(),
  sourceKinds: z.array(sourceKindSchema).readonly(),
  analyzerVersion: nonEmptyString,
  normalizationVersion: nonEmptyString,
  stats: z.object({
    sourcesQueried: z.number().int().nonnegative(),
    entriesRead: z.number().int().nonnegative(),
    nonEmptyValues: z.number().int().nonnegative(),
    rejectedEmptyValues: z.number().int().nonnegative(),
    duplicateOccurrences: z.number().int().nonnegative(),
    uniqueExpressions: z.number().int().nonnegative(),
    sourceWarnings: z.array(z.string()).readonly(),
  }),
});

export const vocabularyItemRowSchema = z.object({
  v: rowVersionSchema,
  id: vocabularyItemIdSchema,
  snapshotId: snapshotIdSchema,
  visibleExpression: nonEmptyString,
  canonicalExpression: nonEmptyString,
  expressionHash: nonEmptyString,
  ...schedulingSignalsShape,
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
  sourceId: vocabularySourceIdSchema,
  sourceKind: sourceKindSchema,
  sourceLabel: nonEmptyString,
  deckName: nonEmptyString.optional(),
  noteTypeName: nonEmptyString.optional(),
  fieldName: nonEmptyString.optional(),
  sourceRecordId: z.string().optional(),
});

const sourceBase = {
  v: rowVersionSchema,
  id: vocabularySourceIdSchema,
  label: nonEmptyString,
  enabled: z.boolean(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  lastSyncedAt: timestampSchema.nullable(),
};

export const vocabularySourceRowSchema = z.discriminatedUnion('kind', [
  z.object({
    ...sourceBase,
    kind: z.literal('anki-connect'),
    providerKind: z.enum(['desktop-connect', 'android-connect']),
    deckName: nonEmptyString,
    deckScope: z.enum(['deck-only', 'deck-and-subdecks']),
    noteTypeName: nonEmptyString,
    expressionFieldName: nonEmptyString,
    automaticSync: z.boolean(),
  }),
  z.object({
    ...sourceBase,
    kind: z.literal('anki-package'),
    providerKind: z.literal('package'),
    deckName: nonEmptyString,
    deckScope: z.enum(['deck-only', 'deck-and-subdecks']),
    noteTypeName: nonEmptyString,
    expressionFieldName: nonEmptyString,
    automaticSync: z.literal(false),
  }),
  z.object({
    ...sourceBase,
    kind: z.literal('text-list'),
    content: z.string(),
  }),
]);

export const vocabularySourceCacheRowSchema = z.object({
  v: rowVersionSchema,
  sourceId: vocabularySourceIdSchema,
  refreshedAt: timestampSchema,
  entries: z
    .array(
      z.object({
        rawValue: z.string().optional(),
        sourceRecordId: z.string().optional(),
        ...schedulingSignalsShape,
      }),
    )
    .readonly(),
  warnings: z.array(z.string()).readonly(),
});

/** Compatibility export for adapters/tests still using mapping terminology. */
export const sourceMappingRowSchema = vocabularySourceRowSchema;

export type VocabularySnapshotRow = z.infer<typeof vocabularySnapshotRowSchema>;
export type VocabularyItemRow = z.infer<typeof vocabularyItemRowSchema>;
export type VocabularyProvenanceRow = z.infer<typeof vocabularyProvenanceRowSchema>;
export type VocabularySourceRow = z.infer<typeof vocabularySourceRowSchema>;
export type VocabularySourceCacheRow = z.infer<typeof vocabularySourceCacheRowSchema>;
export type SourceMappingRow = VocabularySourceRow;
