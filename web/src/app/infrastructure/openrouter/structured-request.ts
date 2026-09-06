import { aiError, TRUNCATED_REPLY_ISSUE_CODE, type AiError } from '../../domain/ai/ai-error';
import type { AiTask } from '../../domain/ai/ai-task';
import { estimateTokens, MAX_REQUEST_TOKENS } from '../../domain/ai/context-budget';
import type { StructuredOutputMode } from '../../domain/ai/model-test';
import { temperatureForTask } from '../../domain/ai/sampling';
import type { StructuredOutputMemo } from '../../domain/ai/structured-output-memo';
import type { TextTaskConfig } from '../../domain/ai/text-generation-provider';
import { isGeminiModel } from '../../domain/ai/tts-configuration';
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
  /** Overrides the task default when one task contains both creative and judgement calls. */
  readonly temperature?: number;
  /**
   * Deadline for one attempt, so a task gets the deadline its work deserves.
   *
   * Enrichment batches are far shorter jobs than writing a story, and a
   * story-sized deadline applied to them is one the learner waits out three
   * times over before anything is reported.
   */
  readonly timeoutMs?: number;
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
  constructor(
    private readonly client: OpenRouterClient,
    private readonly memo?: StructuredOutputMemo,
  ) {}

  /**
   * One task request, with at most one format recovery.
   *
   * Recovery runs only for the two failures a different request shape can
   * actually fix: the provider refusing the schema parameter, and the model
   * answering in the wrong shape. Everything else returns immediately, because
   * repeating it would spend the learner money to reproduce the same answer.
   *
   * A refusal of the schema parameter is remembered before the recovery runs,
   * so the second request is paid once per model rather than once per batch.
   */
  async run<T>(request: StructuredRequest<T>): Promise<Result<T, AiError>> {
    const modelId = request.config.modelId;
    const known = this.memo?.modeFor(modelId) ?? null;
    const mode = known === 'json-contract' ? 'json-contract' : request.config.structuredOutput;

    const first = await this.attempt(request, mode);
    if (first.ok || mode === 'json-contract') {
      return first;
    }

    // A native-schema attempt has no other optional capability. Upstreams do
    // not consistently name `response_format` in 400 responses, so a generic
    // capability rejection is also eligible for the one bounded recovery.
    const refusedSchema = first.error.code === 'capability-unsupported';
    if (refusedSchema) {
      this.memo?.rememberDowngrade(modelId);
    } else if (first.error.code !== 'malformed-response') {
      return first;
    }

    return this.attempt(request, 'json-contract', false);
  }

  private async attempt<T>(
    request: StructuredRequest<T>,
    mode: StructuredOutputMode,
    sample = true,
  ): Promise<Result<T, AiError>> {
    const native = mode === 'native-schema';
    // A refused optional parameter is not always named in the 400, so the one
    // recovery drops every optional parameter at once rather than guessing
    // which of them the provider objected to.
    const temperature = sample
      ? (request.temperature ?? temperatureForTask(request.task))
      : undefined;
    const system = native
      ? request.prompt.system
      : `${request.prompt.system}\n\n${request.prompt.jsonContract}\n${JSON_CONTRACT_REMINDER}`;
    const estimatedInputTokens = estimateTokens(system) + estimateTokens(request.prompt.user);
    if (estimatedInputTokens > MAX_REQUEST_TOKENS) {
      return err(
        aiError(
          'context-budget-exceeded',
          request.task,
          'The assembled request is larger than Monosai can send safely.',
          { detail: { issueCode: 'assembled-request-too-large' } },
        ),
      );
    }
    const response = await this.client.postJson(
      {
        path: CHAT_COMPLETIONS_PATH,
        task: request.task,
        modelId: request.config.modelId,
        timeoutMs: request.timeoutMs ?? GENERATION_REQUEST_TIMEOUT_MS,
        ...(request.signal === undefined ? {} : { signal: request.signal }),
        body: {
          model: request.config.modelId,
          max_tokens: request.maxTokens,
          ...(temperature === undefined ? {} : { temperature }),
          ...reasoningRequest(request.task, request.config.modelId, request.config.reasoningEffort),
          messages: [
            {
              role: 'system',
              content: system,
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
   *
   * A reply the provider stopped for `length` is separated out first. It is not
   * a malformed answer and the format recovery cannot help it: the model ran
   * out of room, and asking the same question in a different wrapper asks for
   * the same number of tokens.
   */
  private readContent<T>(
    completion: ChatCompletion,
    request: StructuredRequest<T>,
  ): Result<T, AiError> {
    if (completion.choices[0]?.finish_reason === 'length') {
      return err(
        aiError(
          'context-budget-exceeded',
          request.task,
          'The model ran out of reply room before it finished answering.',
          { detail: { issueCode: TRUNCATED_REPLY_ISSUE_CODE } },
        ),
      );
    }

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

/**
 * Tasks whose reply budget hidden reasoning would eat for nothing.
 *
 * Translation and grammar review are judgement calls over sentences that
 * already exist, pinned to a low temperature. A reasoning model left to its own
 * defaults spends the whole budget thinking and returns a truncated or empty
 * reply, which reaches the learner as "the model answered wrongly" when it
 * actually ran out of room. Writing a story is the opposite case and keeps
 * whatever the provider defaults to.
 */
const MINIMAL_REASONING_TASKS: readonly AiTask[] = ['translation', 'grammar-review'];

function reasoningRequest(
  task: AiTask,
  modelId: string,
  configured: string | null | undefined,
): object {
  const wantsMinimal = MINIMAL_REASONING_TASKS.includes(task) || isGeminiModel(modelId);
  const effort = configured ?? (wantsMinimal ? 'minimal' : null);
  return effort === null ? {} : { reasoning: { effort, exclude: true } };
}
