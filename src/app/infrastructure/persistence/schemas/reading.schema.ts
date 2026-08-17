import { z } from 'zod';
import {
  completionSummarySchema,
  grammarSummarySchema,
  nonEmptyString,
  paragraphIdSchema,
  readingIdSchema,
  rowVersionSchema,
  sentenceIdSchema,
  snapshotIdSchema,
  timestampSchema,
} from './common.schema';

const readingBaseShape = {
  v: rowVersionSchema,
  id: readingIdSchema,
  title: z.string(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  lastOpenedAt: timestampSchema.nullable(),
  sentenceCount: z.number().int().nonnegative(),
  characterCount: z.number().int().nonnegative(),
  translationSummary: completionSummarySchema,
  grammarSummary: grammarSummarySchema,
  audioSummary: completionSummarySchema,
  analyzerVersion: nonEmptyString,
};

export const readingRowSchema = z.discriminatedUnion('kind', [
  z.object({
    ...readingBaseShape,
    kind: z.literal('imported'),
    importSource: z.enum(['paste', 'text-file']),
    sourceFileName: z.string().optional(),
    sourceTextHash: nonEmptyString,
  }),
  z.object({
    ...readingBaseShape,
    kind: z.literal('generated'),
    form: z.enum(['micro', 'short']),
    premise: z.string(),
    specialInstructions: z.string().optional(),
    snapshotId: snapshotIdSchema,
    generationProvenanceId: nonEmptyString,
    validationOutcome: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('strict') }),
      z.object({ kind: z.literal('exception'), exceptionCount: z.number().int().nonnegative() }),
    ]),
  }),
]);

export const paragraphRowSchema = z.object({
  v: rowVersionSchema,
  id: paragraphIdSchema,
  readingId: readingIdSchema,
  position: z.number().int().nonnegative(),
  sourceText: z.string(),
});

export const sentenceRowSchema = z.object({
  v: rowVersionSchema,
  id: sentenceIdSchema,
  readingId: readingIdSchema,
  paragraphId: paragraphIdSchema,
  positionInReading: z.number().int().nonnegative(),
  positionInParagraph: z.number().int().nonnegative(),
  japaneseText: nonEmptyString,
  contentHash: nonEmptyString,
});

export const tokenSchema = z.object({
  id: nonEmptyString,
  startUtf16: z.number().int().nonnegative(),
  endUtf16: z.number().int().nonnegative(),
  surface: z.string(),
  lemma: z.string().optional(),
  readingHiragana: z.string().optional(),
  partOfSpeech: z
    .enum([
      'noun',
      'proper-noun',
      'pronoun',
      'verb',
      'adjective-i',
      'adjective-na',
      'adverb',
      'determiner',
      'conjunction',
      'particle',
      'auxiliary',
      'prefix',
      'suffix',
      'counter',
      'number',
      'interjection',
      'symbol',
      'other',
    ])
    .optional(),
  dictionaryKeys: z.array(z.string()).readonly(),
  isPunctuation: z.boolean(),
});

export const tokenAnalysisRowSchema = z.object({
  v: rowVersionSchema,
  sentenceId: sentenceIdSchema,
  readingId: readingIdSchema,
  analyzerVersion: nonEmptyString,
  tokens: z.array(tokenSchema).readonly(),
});

export const readingProgressRowSchema = z.object({
  v: rowVersionSchema,
  readingId: readingIdSchema,
  paragraphId: paragraphIdSchema,
  sentenceId: sentenceIdSchema,
  positionInReading: z.number().int().nonnegative(),
  lastOpenedAt: timestampSchema,
  updatedAt: timestampSchema,
});
