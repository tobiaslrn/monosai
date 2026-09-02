import { z } from 'zod';
import {
  jobIdSchema,
  nonEmptyString,
  readingIdSchema,
  rowVersionSchema,
  sentenceIdSchema,
  timestampSchema,
} from './common.schema';

export const assetJobRowSchema = z.object({
  v: rowVersionSchema,
  id: jobIdSchema,
  kind: z.enum(['translate-reading', 'analyze-reading', 'prepare-audio']),
  readingId: readingIdSchema,
  state: z.enum(['queued', 'running', 'paused', 'cancelled', 'failed', 'complete']),
  orderedSentenceIds: z.array(sentenceIdSchema).readonly(),
  completedSentenceIds: z.array(sentenceIdSchema).readonly(),
  failedItems: z
    .array(
      z.object({
        sentenceId: sentenceIdSchema,
        errorCode: nonEmptyString,
        failedAt: timestampSchema,
      }),
    )
    .readonly(),
  configFingerprint: nonEmptyString,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export type AssetJobRow = z.infer<typeof assetJobRowSchema>;
