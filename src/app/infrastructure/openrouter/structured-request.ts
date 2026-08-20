import { aiError, type AiError } from '../../domain/ai/ai-error';
import type { AiTask } from '../../domain/ai/ai-task';
import type { StructuredOutputMode } from '../../domain/ai/model-test';
import type { TextTaskConfig } from '../../domain/ai/text-generation-provider';
import { err, ok, type Result } from '../../domain/shared/result';
import { extractJsonObject } from './json-content';
import type { OpenRouterClient } from './openrouter-client';
import { CHAT_COMPLETIONS_PATH, GENERATION_REQUEST_TIMEOUT_MS } from './openrouter-endpoints';
import { chatCompletionSchema, type ChatCompletion } from './openrouter-response.schema';
import type { AssembledPrompt } from './prompts/prompt-layers';

/** Appended on the single recovery request, never on the first attempt. */
const JSON_CONTRACT_REMINDER =
  'Reply with one JSON object and nothing else: no prose, no code fences, no trailing commentary.';

export interface StructuredRequest<T> {
  readonly task: AiTask;
  readonly config: TextTaskConfig;
  readonly prompt: AssembledPrompt;
  readonly jsonSchema: Record<string, unknown>;
  readonly maxTokens: number;
  readonly read: (parsed: unknown) => Result<T, string>;
  readonly signal?: AbortSignal;
}

/**
 * Runs one structured chat-completion task, with at most one format recovery.
 *
 * Only the request shapes and the reply reading live here; transport,
 * credentials, timeouts, transport retry, and error mapping stay in
 * `OpenRouterClient`, and every judgement about what came back stays in
 * `domain/ai`. The one policy this class owns is format recovery: exactly one
 * extra request per malformed structured reply, deliberately separate from the
 * two content repairs the generation store owns, so the two limits cannot
 * multiply into six.
 */
export class StructuredTaskRunner {
  constructor(private readonly client: OpenRouterClient) {}

  /**
   * One task request, with at most one format recovery.
   *
   * Recovery runs only for the two failures a different request shape can
   * actually fix: the provider refusing the schema parameter, and the model
   * answering in the wrong shape. Everything else returns immediately, because
   * repeating it would spend the learner money to reproduce the same answer.
   */
  async run<T>(request: StructuredRequest<T>): Promise<Result<T, AiError>> {
    const first = await this.attempt(request, request.config.structuredOutput);
    if (first.ok || request.config.structuredOutput === 'json-contract') {
      return first;
    }

    const refusedSchema =
      first.error.code === 'capability-unsupported' &&
      first.error.detail?.capability === 'structured-output';
    if (!refusedSchema && first.error.code !== 'malformed-response') {
      return first;
    }

    return this.attempt(request, 'json-contract');
  }

  private async attempt<T>(
    request: StructuredRequest<T>,
    mode: StructuredOutputMode,
  ): Promise<Result<T, AiError>> {
    const native = mode === 'native-schema';
    const response = await this.client.postJson(
      {
        path: CHAT_COMPLETIONS_PATH,
        task: request.task,
        modelId: request.config.modelId,
        timeoutMs: GENERATION_REQUEST_TIMEOUT_MS,
        ...(request.signal === undefined ? {} : { signal: request.signal }),
        body: {
          model: request.config.modelId,
          max_tokens: request.maxTokens,
          messages: [
            {
              role: 'system',
              content: native
                ? request.prompt.system
                : `${request.prompt.system}\n${JSON_CONTRACT_REMINDER}`,
            },
            { role: 'user', content: request.prompt.user },
          ],
          // The contract mode sends no `response_format` at all: it exists for
          // providers that refuse the parameter outright, so re-sending a
          // different flavour of it would fail for the same reason.
          ...(native
            ? { response_format: { type: 'json_schema', json_schema: request.jsonSchema } }
            : {}),
        },
      },
      chatCompletionSchema,
    );
    if (!response.ok) {
      return response;
    }
    return this.readContent(response.value, request);
  }

  /**
   * Extracts and validates the payload without ever surfacing what was said.
   *
   * The issue code names which step failed and is derived from the step, never
   * from the content, so it can be shown and logged safely.
   */
  private readContent<T>(
    completion: ChatCompletion,
    request: StructuredRequest<T>,
  ): Result<T, AiError> {
    const content = completion.choices[0]?.message.content ?? null;
    if (content === null || content.trim() === '') {
      return err(this.unusable(request.task, 'empty-content'));
    }

    const candidate = extractJsonObject(content);
    if (candidate === null) {
      return err(this.unusable(request.task, 'not-json'));
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      return err(this.unusable(request.task, 'invalid-json'));
    }

    const read = request.read(parsed);
    return read.ok ? ok(read.value) : err(this.unusable(request.task, read.error));
  }

  private unusable(task: AiTask, issueCode: string): AiError {
    return aiError(
      'malformed-response',
      task,
      'The model did not answer in the exact structure Monosai requires.',
      { detail: { issueCode } },
    );
  }
}
