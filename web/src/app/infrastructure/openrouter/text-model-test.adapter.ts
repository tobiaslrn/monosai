import { aiError, type AiError } from '../../domain/ai/ai-error';
import type { ModelTest, StructuredOutputMode, TextModelConfig } from '../../domain/ai/model-test';
import { isGeminiModel } from '../../domain/ai/tts-configuration';
import { err, ok, type Result } from '../../domain/shared/result';
import { extractJsonObject } from './json-content';
import type { OpenRouterClient } from './openrouter-client';
import { CHAT_COMPLETIONS_PATH } from './openrouter-endpoints';
import {
  chatCompletionSchema,
  COMPATIBILITY_PROBE_JSON_SCHEMA,
  compatibilityProbeSchema,
  type ChatCompletion,
} from './openrouter-response.schema';

const TASK = 'text-model-test';

/**
 * The smallest task that still proves what generation depends on: the model
 * follows an exact output shape rather than merely answering.
 */
const PROBE_SYSTEM_PROMPT =
  'You are a formatting compatibility probe. Reply with one JSON object and nothing else.';

const PROBE_USER_PROMPT = 'Reply with exactly {"ok": true, "language": "ja"} and no other text.';

/**
 * Added only when the model could not be driven by a provider-native schema.
 *
 * It says nothing about a previous reply, because there may not have been one:
 * the same recovery runs when the provider refused the `response_format`
 * parameter outright, and telling a model its last answer was malformed when it
 * never gave one is a claim about a history that did not happen.
 */
const PROBE_CONTRACT_REMINDER =
  'Reply with exactly {"ok": true, "language": "ja"} and nothing else: no prose, no code fences.';

/** A compatibility probe needs a handful of tokens; a runaway reply is a failure. */
const MAX_PROBE_TOKENS = 512;

/**
 * Verifies one exact text model against the provider.
 *
 * It implements the testing half of `TextGenerationProvider`; the generation
 * half lives in `story-generation.adapter.ts`, and `OpenRouterTextProvider`
 * composes the two into the object the injection token resolves to.
 *
 * The test is deliberately stricter than ordinary chat: a model that cannot be
 * held to an exact structure cannot be used for generation, so passing here is
 * the precondition the Generate screen checks. At most two requests are made —
 * the structured attempt and one format recovery — so a failing model cannot
 * cost more than that.
 */
export class OpenRouterTextModelTester {
  constructor(private readonly client: OpenRouterClient) {}

  async testConfiguration(
    config: TextModelConfig,
    signal?: AbortSignal,
  ): Promise<Result<ModelTest, AiError>> {
    const modelId = config.modelId.trim();
    if (modelId === '') {
      return err(
        aiError('model-not-found', TASK, 'No model ID was given.', {
          detail: { modelId: '' },
        }),
      );
    }

    const native = await this.probe(modelId, config.reasoningEffort, 'native-schema', signal);
    if (native.ok) {
      return ok({ modelId, structuredOutput: 'native-schema' });
    }

    // Two distinct reasons to fall back, both bounded to a single extra
    // request: the provider refused the schema parameter outright, or it
    // accepted it and the model still answered in the wrong shape.
    // This request has only one optional capability: `response_format` with a
    // JSON schema. Some upstreams (including Gemini through OpenRouter) report
    // a generic invalid-request parameter instead of naming response_format,
    // so any capability rejection here is safe to recover without the schema.
    const refusedSchema = native.error.code === 'capability-unsupported';
    if (!refusedSchema && native.error.code !== 'malformed-response') {
      return native;
    }

    const recovered = await this.probe(modelId, config.reasoningEffort, 'json-contract', signal);
    if (!recovered.ok) {
      return recovered;
    }
    return ok({ modelId, structuredOutput: 'json-contract' });
  }

  private async probe(
    modelId: string,
    reasoningEffort: string | null | undefined,
    mode: StructuredOutputMode,
    signal?: AbortSignal,
  ): Promise<Result<null, AiError>> {
    const native = mode === 'native-schema';
    const response = await this.client.postJson(
      {
        path: CHAT_COMPLETIONS_PATH,
        task: TASK,
        modelId,
        ...(signal === undefined ? {} : { signal }),
        body: {
          model: modelId,
          temperature: 0,
          max_tokens: MAX_PROBE_TOKENS,
          ...reasoningRequest(modelId, reasoningEffort),
          messages: [
            { role: 'system', content: PROBE_SYSTEM_PROMPT },
            {
              role: 'user',
              content: native
                ? PROBE_USER_PROMPT
                : `${PROBE_USER_PROMPT}\n${PROBE_CONTRACT_REMINDER}`,
            },
          ],
          ...(native
            ? {
                response_format: {
                  type: 'json_schema',
                  json_schema: COMPATIBILITY_PROBE_JSON_SCHEMA,
                },
              }
            : {}),
        },
      },
      chatCompletionSchema,
    );
    if (!response.ok) {
      return response;
    }
    return this.readProbe(response.value);
  }

  /** Validates the probe payload without ever surfacing what the model said. */
  private readProbe(completion: ChatCompletion): Result<null, AiError> {
    const content = completion.choices[0]?.message.content ?? null;
    if (content === null || content.trim() === '') {
      return err(this.unusable('empty-content'));
    }

    const candidate = extractJsonObject(content);
    if (candidate === null) {
      return err(this.unusable('not-json'));
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      return err(this.unusable('invalid-json'));
    }

    return compatibilityProbeSchema.safeParse(parsed).success
      ? ok(null)
      : err(this.unusable('probe-shape'));
  }

  private unusable(issueCode: string): AiError {
    return aiError(
      'malformed-response',
      TASK,
      'The model did not produce the exact structure Monosai requires.',
      { detail: { issueCode } },
    );
  }
}

function reasoningRequest(modelId: string, configured: string | null | undefined): object {
  const effort = configured ?? (isGeminiModel(modelId) ? 'minimal' : null);
  return effort === null ? {} : { reasoning: { effort, exclude: true } };
}
