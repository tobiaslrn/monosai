import { z } from 'zod';
import {
  assetIdSchema,
  nonEmptyString,
  readingIdSchema,
  rowVersionSchema,
  sentenceIdSchema,
  timestampSchema,
} from './common.schema';

export const translationRowSchema = z.object({
  v: rowVersionSchema,
  id: nonEmptyString,
  cacheKey: nonEmptyString,
  sentenceId: sentenceIdSchema,
  readingId: readingIdSchema,
  sourceContentHash: nonEmptyString,
  textEn: z.string(),
  modelId: nonEmptyString,
  promptVersion: nonEmptyString,
  createdAt: timestampSchema,
});

export const grammarAnalysisRowSchema = z.object({
  v: rowVersionSchema,
  id: nonEmptyString,
  cacheKey: nonEmptyString,
  sentenceId: sentenceIdSchema,
  readingId: readingIdSchema,
  sourceContentHash: nonEmptyString,
  profileHash: nonEmptyString,
  modelId: nonEmptyString,
  promptVersion: nonEmptyString,
  findings: z
    .array(
      z.object({
        label: nonEmptyString,
        explanationEn: z.string(),
        confidence: z.enum(['low', 'medium', 'high']),
        inProfile: z.boolean(),
        startUtf16: z.number().int().nonnegative().optional(),
        endUtf16: z.number().int().nonnegative().optional(),
      }),
    )
    .readonly(),
  createdAt: timestampSchema,
});

export const audioAssetMetadataSchema = z.object({
  v: rowVersionSchema,
  id: assetIdSchema,
  cacheKey: nonEmptyString,
  sentenceId: sentenceIdSchema,
  readingId: readingIdSchema,
  sourceContentHash: nonEmptyString,
  modelId: nonEmptyString,
  voiceId: nonEmptyString,
  optionsFingerprint: nonEmptyString,
  mimeType: z.enum(['audio/mpeg', 'audio/pcm', 'audio/wav']),
  byteLength: z.number().int().positive(),
  createdAt: timestampSchema,
});

export type TranslationRow = z.infer<typeof translationRowSchema>;
export type GrammarAnalysisRow = z.infer<typeof grammarAnalysisRowSchema>;
export type AudioAssetMetadata = z.infer<typeof audioAssetMetadataSchema>;
/**
 * Audio is stored as raw bytes rather than a `Blob`. Bytes are portable across
 * IndexedDB implementations and are re-wrapped into a `Blob` with the stored
 * MIME type when a clip is read.
 */
export type AudioAssetStoredRow = AudioAssetMetadata & { readonly bytes: ArrayBuffer };
