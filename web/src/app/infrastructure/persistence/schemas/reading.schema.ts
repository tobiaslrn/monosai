import { z } from 'zod';
import {
  INFLECTION_FORM_LABELS,
  PART_OF_SPEECH_LABELS,
  VERB_CONJUGATION_FAMILIES,
  type InflectionForm,
  type PartOfSpeech,
} from '../../../domain/reading/token';
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
  excerpt: z.string(),
  translationSummary: completionSummarySchema,
  grammarSummary: grammarSummarySchema,
  audioSummary: completionSummarySchema,
  preparationTargets: z.array(z.enum(['english', 'grammar', 'audio'])).readonly(),
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
    form: z.enum(['micro', 'short', 'medium', 'long']),
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

/**
 * Both enums are derived from the domain records rather than restated here, so
 * a new word class or inflection form cannot be accepted by the type system and
 * rejected by the store.
 */
const partOfSpeechValues = Object.keys(PART_OF_SPEECH_LABELS) as [PartOfSpeech, ...PartOfSpeech[]];
const inflectionFormValues = Object.keys(INFLECTION_FORM_LABELS) as [
  InflectionForm,
  ...InflectionForm[],
];

export const tokenSchema = z.object({
  id: nonEmptyString,
  startUtf16: z.number().int().nonnegative(),
  endUtf16: z.number().int().nonnegative(),
  surface: z.string(),
  lemma: z.string().optional(),
  readingHiragana: z.string().optional(),
  partOfSpeech: z.enum(partOfSpeechValues).optional(),
  inflectionForm: z.enum(inflectionFormValues).optional(),
  verbConjugationFamily: z.enum(VERB_CONJUGATION_FAMILIES).optional(),
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
