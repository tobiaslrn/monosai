import { z } from 'zod';
import { MAX_STORY_SEGMENT_SENTENCES, MAX_STORY_SENTENCES } from '../../domain/ai/story-request';

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

/** Only the model-catalogue fields Monosai uses. */
export const modelCatalogResponseSchema = z.object({
  data: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      context_length: z.number().int().nonnegative().nullable(),
      architecture: z.object({
        input_modalities: z.array(z.string()),
        output_modalities: z.array(z.string()),
      }),
      supported_parameters: z.array(z.string()),
      supported_voices: z.array(z.string()).nullable(),
      reasoning: z
        .object({
          supported_efforts: z.array(z.string().nullable()).nullable().optional(),
          default_effort: z.string().nullable().optional(),
          default_enabled: z.boolean().optional(),
          mandatory: z.boolean(),
          supports_max_tokens: z.boolean().optional(),
        })
        .optional(),
    }),
  ),
});

export type ModelCatalogResponse = z.infer<typeof modelCatalogResponseSchema>;

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
    .max(MAX_STORY_SEGMENT_SENTENCES),
});

export type StoryCandidatePayload = z.infer<typeof storyCandidateSchema>;

/**
 * The JSON Schema sent to models driven by provider-native structured output.
 *
 * Built per request so the requested upper bound is expressed where the
 * provider can enforce it. Undershoot remains valid because length is guidance
 * to a stochastic writer, not a local acceptance constraint.
 */
export function storyCandidateJsonSchema(requestedSentenceCount: number): Record<string, unknown> {
  return {
    name: 'monosai_story',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['titleJa', 'sentences'],
      properties: {
        titleJa: {
          type: 'string',
          description:
            'Short Japanese title. No romaji, furigana, translation, or parenthetical gloss.',
        },
        sentences: {
          type: 'array',
          minItems: 1,
          maxItems: Math.min(requestedSentenceCount, MAX_STORY_SEGMENT_SENTENCES),
          description: 'The story in reading order, one sentence per entry.',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['index', 'textJa'],
            properties: {
              index: {
                type: 'integer',
                minimum: 0,
                description: 'Reading position, starting at 0 and contiguous.',
              },
              textJa: {
                type: 'string',
                description: 'Exactly one Japanese sentence. Never two, never a fragment of one.',
              },
            },
          },
        },
      },
    },
  };
}

/** The patch a scoped repair returns: only the entries it was asked to rewrite. */
export const storyRepairPatchSchema = z.object({
  titleJa: z.string().nullable(),
  replacements: z
    .array(
      z.object({
        index: z.number().int(),
        textJa: z.string(),
      }),
    )
    .max(MAX_STORY_SEGMENT_SENTENCES),
});

export type StoryRepairPatchPayload = z.infer<typeof storyRepairPatchSchema>;

export function storyRepairPatchJsonSchema(targetCount: number): Record<string, unknown> {
  return {
    name: 'monosai_story_repair_patch',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['titleJa', 'replacements'],
      properties: {
        titleJa: {
          type: ['string', 'null'],
          description: 'The rewritten Japanese title, or null when the title is not a target.',
        },
        replacements: {
          type: 'array',
          minItems: targetCount,
          maxItems: targetCount,
          description: 'One entry per target index, and no entry for any other index.',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['index', 'textJa'],
            properties: {
              index: {
                type: 'integer',
                description: 'A supplied target index, copied exactly.',
              },
              textJa: {
                type: 'string',
                description:
                  'The rewritten Japanese sentence: same meaning and role, no disallowed expression.',
              },
            },
          },
        },
      },
    },
  };
}

export const storyBlueprintSchema = z.object({
  titleJa: z.string(),
  segments: z
    .array(
      z.object({
        index: z.number().int().nonnegative(),
        sentenceCount: z.number().int().positive().max(MAX_STORY_SEGMENT_SENTENCES),
        beatEn: z.string().min(1).max(1_000),
      }),
    )
    .max(Math.ceil(MAX_STORY_SENTENCES / MAX_STORY_SEGMENT_SENTENCES)),
});

export function storyBlueprintJsonSchema(segmentCount: number): Record<string, unknown> {
  return {
    name: 'monosai_story_blueprint',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['titleJa', 'segments'],
      properties: {
        titleJa: {
          type: 'string',
          description:
            "The finished story's Japanese title. No romaji, furigana, translation, or gloss.",
        },
        segments: {
          type: 'array',
          minItems: segmentCount,
          maxItems: segmentCount,
          description: 'One entry per supplied segment, in the supplied order.',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['index', 'sentenceCount', 'beatEn'],
            properties: {
              index: { type: 'integer', minimum: 0, description: 'The supplied index, unchanged.' },
              sentenceCount: {
                type: 'integer',
                minimum: 1,
                maximum: MAX_STORY_SEGMENT_SENTENCES,
                description: 'The supplied sentence count, unchanged.',
              },
              beatEn: {
                type: 'string',
                description:
                  'What happens in this segment, in one or two plain English sentences. Planning data, never shown to the learner, and not subject to the Japanese allowlist.',
              },
            },
          },
        },
      },
    },
  };
}

export const storySegmentCandidateSchema = z.object({
  sentences: z
    .array(
      z.object({
        index: z.number().int().nonnegative(),
        textJa: z.string(),
      }),
    )
    .max(MAX_STORY_SEGMENT_SENTENCES),
  continuitySummaryEn: z.string().min(1).max(2_000),
});

export function storySegmentJsonSchema(sentenceCount: number): Record<string, unknown> {
  return {
    name: 'monosai_story_segment',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['sentences', 'continuitySummaryEn'],
      properties: {
        sentences: {
          type: 'array',
          minItems: 1,
          maxItems: sentenceCount,
          description: 'This segment only, in reading order, one sentence per entry.',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['index', 'textJa'],
            properties: {
              index: {
                type: 'integer',
                minimum: 0,
                description: 'Position within this segment, starting at 0 and contiguous.',
              },
              textJa: {
                type: 'string',
                description: 'Exactly one Japanese sentence.',
              },
            },
          },
        },
        continuitySummaryEn: {
          type: 'string',
          description:
            'Cumulative English summary of the story so far, written for the next request: who is present, where, what has happened, and what is unresolved. Never shown to the learner.',
        },
      },
    },
  };
}

/**
 * The exception review's answer.
 *
 * No free-form category is accepted: a taxonomy invented by a model is not
 * validation evidence and only increases output ambiguity.
 */
export const exceptionDecisionsSchema = z.object({
  decisions: z
    .array(
      z.object({
        candidateId: z.string(),
        decision: z.enum(['approved', 'rejected']),
        explanationEn: z.string(),
      }),
    )
    .max(256),
});

export type ExceptionDecisionsPayload = z.infer<typeof exceptionDecisionsSchema>;

export function exceptionDecisionsJsonSchema(candidateCount: number): Record<string, unknown> {
  return {
    name: 'monosai_exception_decisions',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['decisions'],
      properties: {
        decisions: {
          type: 'array',
          minItems: candidateCount,
          maxItems: candidateCount,
          description: 'One entry per supplied candidate id, and no entry for any other id.',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['candidateId', 'decision', 'explanationEn'],
            properties: {
              candidateId: {
                type: 'string',
                description: 'A supplied candidate id, copied exactly.',
              },
              decision: {
                type: 'string',
                enum: ['approved', 'rejected'],
                description:
                  'Approved only when the learner exception policy clearly covers every supplied use of the word.',
              },
              explanationEn: {
                type: 'string',
                description:
                  'One plain English sentence naming the part of the policy that applies and why this word falls under it. An explanation that only restates the verdict is discarded.',
              },
            },
          },
        },
      },
    },
  };
}

/**
 * The grammar review's answer.
 *
 * Only schema shape is checked here: whether a span is really a substring of
 * the sentence, whether a sentence id is one the caller actually asked about,
 * and what to do when either fails are all judgements `domain/enrichment` makes
 * with context this schema does not have (ai-pipelines section on grammar
 * review).
 */
export const grammarReviewSchema = z.object({
  findings: z
    .array(
      z.object({
        sentenceId: z.string(),
        label: z.string(),
        explanationEn: z.string(),
        confidence: z.enum(['low', 'medium', 'high']),
        inProfile: z.boolean(),
        spanJa: z.string().nullable().optional(),
      }),
    )
    .max(128),
});

export type GrammarReviewPayload = z.infer<typeof grammarReviewSchema>;

export function grammarReviewJsonSchema(sentenceCount: number): Record<string, unknown> {
  return {
    name: 'monosai_grammar_review',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['findings'],
      properties: {
        findings: {
          type: 'array',
          maxItems: sentenceCount,
          description: 'At most one useful finding per sentence, with above-ceiling grammar first.',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['sentenceId', 'label', 'explanationEn', 'confidence', 'inProfile', 'spanJa'],
            properties: {
              sentenceId: {
                type: 'string',
                description: 'A supplied sentence id, copied exactly.',
              },
              label: {
                type: 'string',
                description: 'The construction as a tutor would name it, for example "て-form".',
              },
              explanationEn: {
                type: 'string',
                description:
                  'One or two plain sentences a beginner can read, saying what the construction does in this exact sentence. Gloss any grammatical term used.',
              },
              confidence: {
                type: 'string',
                enum: ['low', 'medium', 'high'],
                description: 'How sure the construction is present and correctly named.',
              },
              inProfile: {
                type: 'boolean',
                description:
                  "False when the construction exceeds the supplied profile's ceiling, true when it is within it.",
              },
              spanJa: {
                type: ['string', 'null'],
                description:
                  'The exact substring of that sentence the finding is about, copied character for character, or null for a sentence-level observation.',
              },
            },
          },
        },
      },
    },
  };
}

/**
 * The translation batch's answer.
 *
 * Matching returned ids back to the request — rejecting a missing, extra,
 * duplicate, or blank translation — is `matchTranslations` in
 * `domain/ai/translation-request`, not this schema: this only checks that the
 * reply is shaped like a list of `{ id, textEn }` pairs.
 */
export const translationsSchema = z.object({
  translations: z
    .array(
      z.object({
        id: z.string(),
        textEn: z.string(),
      }),
    )
    .max(64),
});

export type TranslationsPayload = z.infer<typeof translationsSchema>;

export function translationsJsonSchema(targetCount: number): Record<string, unknown> {
  return {
    name: 'monosai_translations',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['translations'],
      properties: {
        translations: {
          type: 'array',
          minItems: targetCount,
          maxItems: targetCount,
          description: 'One entry per requested target id, and no entry for any other id.',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'textEn'],
            properties: {
              id: { type: 'string', description: 'A requested target id, copied exactly.' },
              textEn: {
                type: 'string',
                description:
                  'Natural English for that one Japanese sentence, readable beside it as a comprehension check. No notes, no glosses, no added detail.',
              },
            },
          },
        },
      },
    },
  };
}
