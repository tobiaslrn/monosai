import { z } from 'zod';

/**
 * Runtime shapes for everything the provider can send back.
 *
 * Nothing below is trusted before it is parsed, and nothing parsed here is ever
 * copied into an error: the schemas exist to decide whether a response is
 * usable, not to carry provider content outwards.
 */

/** The error envelope OpenAI-compatible endpoints use for 4xx and 5xx bodies. */
export const providerErrorEnvelopeSchema = z.object({
  error: z.object({
    message: z.string().optional(),
    code: z.union([z.string(), z.number()]).optional(),
    type: z.string().optional(),
    param: z.string().nullish(),
  }),
});

export type ProviderErrorEnvelope = z.infer<typeof providerErrorEnvelopeSchema>;

/** Only the parts of a chat completion Monosai actually reads. */
export const chatCompletionSchema = z.object({
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullish(),
        message: z.object({
          content: z.string().nullable(),
        }),
      }),
    )
    .min(1),
});

export type ChatCompletion = z.infer<typeof chatCompletionSchema>;

/**
 * The payload the compatibility test asks the model to produce.
 *
 * It is deliberately tiny and unambiguous: the test proves the model can be
 * driven to an exact structure, and a larger probe would only make failures
 * harder to attribute.
 */
export const compatibilityProbeSchema = z.object({
  ok: z.literal(true),
  language: z.literal('ja'),
});

export type CompatibilityProbe = z.infer<typeof compatibilityProbeSchema>;

/** The JSON Schema sent to models that support provider-native structured output. */
export const COMPATIBILITY_PROBE_JSON_SCHEMA = {
  name: 'monosai_compatibility_probe',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['ok', 'language'],
    properties: {
      ok: { type: 'boolean', enum: [true] },
      language: { type: 'string', enum: ['ja'] },
    },
  },
} as const;

/**
 * The story a generation or repair request must return.
 *
 * Japanese only: translations are generated after the final Japanese is
 * accepted, so a repair can never leave a stale English sentence behind
 * (ai-pipelines section 4).
 */
export const storyCandidateSchema = z.object({
  titleJa: z.string(),
  sentences: z
    .array(
      z.object({
        index: z.number().int().nonnegative(),
        textJa: z.string(),
      }),
    )
    .max(64),
});

export type StoryCandidatePayload = z.infer<typeof storyCandidateSchema>;

/** The JSON Schema sent to models driven by provider-native structured output. */
export const STORY_CANDIDATE_JSON_SCHEMA = {
  name: 'monosai_story',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['titleJa', 'sentences'],
    properties: {
      titleJa: { type: 'string' },
      sentences: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['index', 'textJa'],
          properties: {
            index: { type: 'integer', minimum: 0 },
            textJa: { type: 'string' },
          },
        },
      },
    },
  },
} as const;

/**
 * The exception review's answer.
 *
 * `category` is optional and free text; it is recorded but never given meaning,
 * because a taxonomy invented by the model is not one Monosai can validate.
 */
export const exceptionDecisionsSchema = z.object({
  decisions: z
    .array(
      z.object({
        candidateId: z.string(),
        decision: z.enum(['approved', 'rejected']),
        explanationEn: z.string(),
        category: z.string().optional(),
      }),
    )
    .max(256),
});

export type ExceptionDecisionsPayload = z.infer<typeof exceptionDecisionsSchema>;

export const EXCEPTION_DECISIONS_JSON_SCHEMA = {
  name: 'monosai_exception_decisions',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['decisions'],
    properties: {
      decisions: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['candidateId', 'decision', 'explanationEn'],
          properties: {
            candidateId: { type: 'string' },
            decision: { type: 'string', enum: ['approved', 'rejected'] },
            explanationEn: { type: 'string' },
            category: { type: 'string' },
          },
        },
      },
    },
  },
} as const;
