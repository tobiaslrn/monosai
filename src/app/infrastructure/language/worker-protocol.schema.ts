import { z } from 'zod';
import { snapshotId, vocabularyItemId } from '../../domain/shared/ids';
import { INFLECTION_FORM_LABELS, type InflectionForm } from '../../domain/reading/token';
import { languageAssetManifestSchema, partOfSpeechSchema } from './language-asset.schema';

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

const languageErrorSchema = z.object({
  domain: z.literal('language'),
  code: nonEmpty,
  message: z.string(),
  cause: z.string().optional(),
});

/**
 * Runtime shape of a worker response as seen by the client. Only the envelope is
 * validated: the result payload was produced by code in this repository against
 * the same protocol version, while the envelope is what routing and error
 * handling depend on.
 */
export const languageResponseEnvelopeSchema = z.object({
  protocolVersion: z.number().int(),
  requestId: nonEmpty,
  outcome: z.union([
    z.object({ ok: z.literal(true), result: z.object({ operation: nonEmpty }).loose() }),
    z.object({ ok: z.literal(false), error: languageErrorSchema }),
  ]),
});
