import { z } from 'zod';
import {
  assetId,
  jobId,
  paragraphId,
  readingId,
  sentenceId,
  snapshotId,
  sourceMappingId,
  vocabularySourceId,
  vocabularyItemId,
} from '../../../domain/shared/ids';

/** Persisted row schema version. Bumped alongside a Dexie migration. */
export const ROW_VERSION = 1;

export const rowVersionSchema = z.number().int().positive();
export const timestampSchema = z.number().int().nonnegative();
export const nonEmptyString = z.string().min(1);

export const readingIdSchema = z.uuid().transform(readingId);
export const paragraphIdSchema = z.uuid().transform(paragraphId);
export const sentenceIdSchema = z.uuid().transform(sentenceId);
export const snapshotIdSchema = z.uuid().transform(snapshotId);
export const vocabularyItemIdSchema = z.uuid().transform(vocabularyItemId);
export const sourceMappingIdSchema = z.uuid().transform(sourceMappingId);
export const vocabularySourceIdSchema = z.uuid().transform(vocabularySourceId);
export const assetIdSchema = z.uuid().transform(assetId);
export const jobIdSchema = z.uuid().transform(jobId);

export const completionSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});

export const grammarSummarySchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('not-requested') }),
  z.object({
    state: z.literal('partial'),
    analyzedSentenceCount: z.number().int().nonnegative(),
    concernCount: z.number().int().nonnegative(),
  }),
  z.object({ state: z.literal('complete'), concernCount: z.number().int().nonnegative() }),
  z.object({ state: z.literal('unavailable'), reasonCode: nonEmptyString }),
]);
