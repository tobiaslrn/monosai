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
