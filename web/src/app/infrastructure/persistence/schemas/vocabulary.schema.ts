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

/**
 * Optional because a row written before a signal existed legitimately lacks it,
 * and because no source can prove every signal: a package carries a review log
 * that AnkiDroid's provider cannot expose at all. Zod strips unknown keys, so a
 * signal missing from this shape would be silently dropped on read.
 */
const schedulingSignalsShape = {
  reps: z.number().int().positive().optional(),
  lapseRatio: z.number().min(0).max(1).optional(),
  easeFactor: z.number().positive().optional(),
  firstReviewedAt: z.number().int().positive().optional(),
  intervalDays: z.number().positive().optional(),
  fsrsDifficulty: z.number().min(1).max(10).optional(),
  lastReviewedAt: z.number().int().positive().optional(),
};

/**
 * One expression's recent-study evidence.
 *
 * Only positive membership is stored. A word absent from a pool is absent from
 * the row, and whether that means "not practised" or "never asked" is answered
 * by the capture's basis, not by the row.
 */
const practiceEvidenceSchema = z.object({
  answeredWithinDays: z.union([z.literal(1), z.literal(3), z.literal(7)]).optional(),
  answeredAgain: z.literal(true).optional(),
  answeredHard: z.literal(true).optional(),
  recentlyAnsweredWhileLearning: z.literal(true).optional(),
  recentlyAnsweredWithShortInterval: z.literal(true).optional(),
});

const evidenceAvailabilitySchema = z.enum(['available', 'unsupported', 'unavailable']);

/** What one read of one source could establish, recorded once for the read. */
const practiceObservationBasisSchema = z.object({
  recentAnswers: evidenceAvailabilitySchema,
  recentDifficulty: evidenceAvailabilitySchema,
  learningState: evidenceAvailabilitySchema,
  fsrsDifficulty: evidenceAvailabilitySchema,
  windowBasis: z.enum(['anki-study-days', 'rolling-days']),
  observedAt: timestampSchema,
});

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
  practice: practiceEvidenceSchema.optional(),
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
        practice: practiceEvidenceSchema.optional(),
      }),
    )
    .readonly(),
  warnings: z.array(z.string()).readonly(),
  practice: practiceObservationBasisSchema,
});

/** Compatibility export for adapters/tests still using mapping terminology. */
export const sourceMappingRowSchema = vocabularySourceRowSchema;

export type VocabularySnapshotRow = z.infer<typeof vocabularySnapshotRowSchema>;
export type VocabularyItemRow = z.infer<typeof vocabularyItemRowSchema>;
export type VocabularyProvenanceRow = z.infer<typeof vocabularyProvenanceRowSchema>;
export type VocabularySourceRow = z.infer<typeof vocabularySourceRowSchema>;
export type VocabularySourceCacheRow = z.infer<typeof vocabularySourceCacheRowSchema>;
export type SourceMappingRow = VocabularySourceRow;
