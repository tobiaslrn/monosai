import * as z from 'zod';
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
 * and because no source can prove every signal. Android's first review is a
 * study-day observation rather than an exact instant, so its representative
 * timestamp carries an explicit precision marker. Zod strips unknown keys, so
 * a signal missing from this shape would be silently dropped on read.
 */
const schedulingSignalsShape = {
  reps: z.number().int().positive().exactOptional(),
  lapseRatio: z.number().min(0).max(1).exactOptional(),
  easeFactor: z.number().positive().exactOptional(),
  firstReviewedAt: z.number().int().positive().exactOptional(),
  firstReviewedPrecision: z.enum(['exact', 'anki-day']).exactOptional(),
  intervalDays: z.number().positive().exactOptional(),
  fsrsDifficulty: z.number().min(1).max(10).exactOptional(),
  lastReviewedAt: z.number().int().positive().exactOptional(),
};

/**
 * One expression's recent-study evidence.
 *
 * Only positive membership is stored. A word absent from a pool is absent from
 * the row, and whether that means "not practised" or "never asked" is answered
 * by the capture's basis, not by the row.
 */
const practiceEvidenceSchema = z.object({
  answeredWithinDays: z.union([z.literal(1), z.literal(3), z.literal(7)]).exactOptional(),
  answeredAgain: z.literal(true).exactOptional(),
  answeredHard: z.literal(true).exactOptional(),
  recentlyAnsweredWhileLearning: z.literal(true).exactOptional(),
  recentlyAnsweredWithShortInterval: z.literal(true).exactOptional(),
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
  /**
   * Opaque, not a uuid: rows written before revisions existed were backfilled
   * with a token derived from the row itself, which is exactly as usable for
   * saying "this is no longer what you captured".
   */
  revision: nonEmptyString,
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
  meaning: nonEmptyString.exactOptional(),
  ...schedulingSignalsShape,
  practice: practiceEvidenceSchema.exactOptional(),
  analyzedSequence: z
    .array(
      z.object({
        surface: z.string(),
        lemma: z.string().exactOptional(),
        readingHiragana: z.string().exactOptional(),
      }),
    )
    .readonly(),
});

export const vocabularyProvenanceRowSchema = z.object({
  id: z.number().int().exactOptional(),
  v: rowVersionSchema,
  vocabularyItemId: vocabularyItemIdSchema,
  sourceId: vocabularySourceIdSchema,
  sourceKind: sourceKindSchema,
  sourceLabel: nonEmptyString,
  deckName: nonEmptyString.exactOptional(),
  noteTypeName: nonEmptyString.exactOptional(),
  fieldName: nonEmptyString.exactOptional(),
  meaningFieldName: nonEmptyString.exactOptional(),
  sourceRecordId: z.string().exactOptional(),
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
    meaningFieldName: nonEmptyString.exactOptional(),
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
    meaningFieldName: nonEmptyString.exactOptional(),
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
        rawValue: z.string().exactOptional(),
        rawMeaning: z.string().exactOptional(),
        sourceRecordId: z.string().exactOptional(),
        ...schedulingSignalsShape,
        practice: practiceEvidenceSchema.exactOptional(),
      }),
    )
    .readonly(),
  warnings: z.array(z.string()).readonly(),
  practice: practiceObservationBasisSchema,
});

export type VocabularySnapshotRow = z.infer<typeof vocabularySnapshotRowSchema>;
export type VocabularyItemRow = z.infer<typeof vocabularyItemRowSchema>;
export type VocabularyProvenanceRow = z.infer<typeof vocabularyProvenanceRowSchema>;
export type VocabularySourceRow = z.infer<typeof vocabularySourceRowSchema>;
export type VocabularySourceCacheRow = z.infer<typeof vocabularySourceCacheRowSchema>;
