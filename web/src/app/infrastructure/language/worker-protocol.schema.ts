import * as z from 'zod';
import { ALL_LANGUAGE_ERROR_CODES } from '../../domain/language/language-error';
import { snapshotId, vocabularyItemId } from '../../domain/shared/ids';
import { INFLECTION_FORM_LABELS, type InflectionForm } from '../../domain/reading/token';
import {
  grammarPresetSchema,
  languageAssetManifestSchema,
  partOfSpeechSchema,
  registerGuidanceSchema,
  structuralBaselineEntrySchema,
  verbConjugationFamilySchema,
} from './language-asset.schema';
import { tokenValidationSchema } from './token-validation.schema';
import type { LanguageOperation, ResultFor } from './worker-protocol';

const nonEmpty = z.string().min(1);

const inflectionFormSchema = z.enum(
  Object.keys(INFLECTION_FORM_LABELS) as [InflectionForm, ...InflectionForm[]],
);

const tokenSchema = z.object({
  id: nonEmpty,
  startUtf16: z.number().int().nonnegative(),
  endUtf16: z.number().int().positive(),
  surface: nonEmpty,
  lemma: z.string().optional(),
  readingHiragana: z.string().optional(),
  partOfSpeech: partOfSpeechSchema.optional(),
  inflectionForm: inflectionFormSchema.optional(),
  verbConjugationFamily: verbConjugationFamilySchema.optional(),
  dictionaryKeys: z.array(z.string()),
  isPunctuation: z.boolean(),
});

const vocabularyItemSchema = z.object({
  id: nonEmpty.transform(vocabularyItemId),
  snapshotId: nonEmpty.transform(snapshotId),
  visibleExpression: nonEmpty,
  canonicalExpression: nonEmpty,
  expressionHash: nonEmpty,
  analyzedSequence: z.array(
    z.object({
      surface: nonEmpty,
      lemma: z.string().optional(),
      readingHiragana: z.string().optional(),
    }),
  ),
});

const dictionaryQuerySchema = z.object({
  surface: nonEmpty,
  lemma: z.string().optional(),
  readingHiragana: z.string().optional(),
  partOfSpeech: partOfSpeechSchema.optional(),
  verbConjugationFamily: verbConjugationFamilySchema.optional(),
  limit: z.number().int().positive().optional(),
});

const requestSchema = z.discriminatedUnion('operation', [
  z.object({
    operation: z.literal('initialize'),
    payload: z.object({ baseUrl: nonEmpty, manifest: languageAssetManifestSchema }),
  }),
  z.object({ operation: z.literal('segment'), payload: z.object({ text: z.string() }) }),
  z.object({
    operation: z.literal('analyze'),
    payload: z.object({ text: z.string(), unit: z.enum(['paragraph', 'sentence']) }),
  }),
  z.object({
    operation: z.literal('analyze-sentences'),
    payload: z.object({ texts: z.array(z.string()) }),
  }),
  z.object({
    operation: z.literal('lookup'),
    payload: z.object({ query: dictionaryQuerySchema }),
  }),
  z.object({
    operation: z.literal('compile-snapshot'),
    payload: z.object({ snapshotId: nonEmpty, items: z.array(vocabularyItemSchema) }),
  }),
  z.object({
    operation: z.literal('classify'),
    payload: z.object({
      snapshotId: nonEmpty,
      mode: z.enum(['imported', 'generated']),
      sentences: z.array(z.object({ sentenceId: nonEmpty, tokens: z.array(tokenSchema) })),
    }),
  }),
  z.object({
    operation: z.literal('cancel'),
    payload: z.object({ targetRequestId: nonEmpty }),
  }),
]);

/**
 * Runtime shape of an incoming worker request.
 *
 * The protocol version is deliberately a plain number here rather than a literal
 * so a mismatched client still produces a `protocol-version-mismatch` response
 * instead of an unhelpful schema error.
 */
export const languageRequestMessageSchema = z.object({
  protocolVersion: z.number().int(),
  requestId: nonEmpty,
  request: requestSchema,
});

export const languageErrorSchema = z.object({
  domain: z.literal('language'),
  code: z.enum(ALL_LANGUAGE_ERROR_CODES),
  message: z.string(),
  cause: z.string().optional(),
});

/**
 * Runtime shape of a worker response as seen by the client.
 *
 * The envelope is what routing depends on, so it is checked first and alone:
 * once the request id is known, a malformed result or error can settle that
 * request with `invalid-response` instead of leaving it pending forever.
 */
export const languageResponseEnvelopeSchema = z.object({
  protocolVersion: z.number().int(),
  requestId: nonEmpty,
  outcome: z.union([
    z.object({
      ok: z.literal(true),
      result: z.object({ operation: nonEmpty, value: z.unknown() }),
    }),
    z.object({ ok: z.literal(false), error: z.unknown() }),
  ]),
});

const segmentSchema = z.object({
  startUtf16: z.number().int().nonnegative(),
  endUtf16: z.number().int().nonnegative(),
  text: z.string(),
});

const analyzedSentenceSchema = segmentSchema.extend({ tokens: z.array(tokenSchema) });

const workerTokenValidationSchema = tokenValidationSchema(nonEmpty.transform(vocabularyItemId));

/**
 * The result value each operation answers with, checked once the operation has
 * been matched against the pending request.
 *
 * Every result is parsed in full, tokenized readings included. On the
 * 50,000-character analysis fixture (about 37,000 tokens) that took roughly
 * 20 ms, against 460 ms of analysis and under half of structured-cloning the same
 * result costs; the 120- to 200-sentence batches callers actually send parse in
 * about a millisecond. Unlike stored token arrays, which are re-read often and
 * so checked in development only, a worker answer is checked once on arrival.
 * `cancel` has no entry because the client never waits on one.
 */
export const languageResultValueSchemas: {
  readonly [TOperation in Exclude<LanguageOperation, 'cancel'>]: z.ZodType<ResultFor<TOperation>>;
} = {
  initialize: z.object({
    bundleVersion: nonEmpty,
    versions: z.object({
      tokenizerVersion: nonEmpty,
      dictionaryVersion: nonEmpty,
      grammarPresetsVersion: nonEmpty,
      structuralBaselineVersion: nonEmpty,
    }),
    analyzerVersion: nonEmpty,
    dictionaryEntryCount: z.number().int().nonnegative(),
    structuralBaselineEntries: z.array(structuralBaselineEntrySchema),
    grammarPresets: z.array(grammarPresetSchema),
    registerGuidance: registerGuidanceSchema,
  }),
  segment: z.array(segmentSchema),
  analyze: z.object({
    analyzerVersion: nonEmpty,
    segmentationRulesVersion: nonEmpty,
    sentences: z.array(analyzedSentenceSchema),
  }),
  'analyze-sentences': z.array(analyzedSentenceSchema),
  lookup: z.object({
    matchedBy: z.enum(['surface', 'lemma', 'reading', 'variant', 'none']),
    entries: z.array(
      z.object({
        id: nonEmpty,
        writtenForms: z.array(z.string()),
        readings: z.array(z.string()),
        senses: z.array(
          z.object({ partsOfSpeech: z.array(partOfSpeechSchema), glossesEn: z.array(z.string()) }),
        ),
      }),
    ),
  }),
  'compile-snapshot': z.object({
    snapshotId: nonEmpty,
    itemCount: z.number().int().nonnegative(),
  }),
  classify: z.object({
    snapshotId: nonEmpty,
    validatorVersion: nonEmpty,
    sentences: z.array(
      z.object({
        sentenceId: nonEmpty,
        statuses: z.array(z.object({ tokenId: nonEmpty, validation: workerTokenValidationSchema })),
      }),
    ),
  }),
};
