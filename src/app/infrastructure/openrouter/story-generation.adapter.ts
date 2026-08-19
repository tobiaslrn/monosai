import { aiError, type AiError } from '../../domain/ai/ai-error';
import type { AiTask } from '../../domain/ai/ai-task';
import type { ExceptionDecision } from '../../domain/ai/exception-review';
import type { StructuredOutputMode } from '../../domain/ai/model-test';
import type {
  SentenceRange,
  StoryCandidate,
  StoryGenerationRequest,
} from '../../domain/ai/story-request';
import {
  checkStoryStructure,
  hasFormatFailure,
  normalizeCandidate,
} from '../../domain/ai/story-structure';
import type {
  ExceptionReviewRequest,
  StoryRepairRequest,
  TextTaskConfig,
} from '../../domain/ai/text-generation-provider';
import { err, ok, type Result } from '../../domain/shared/result';
import { extractJsonObject } from './json-content';
import type { OpenRouterClient } from './openrouter-client';
import { CHAT_COMPLETIONS_PATH, GENERATION_REQUEST_TIMEOUT_MS } from './openrouter-endpoints';
import {
  EXCEPTION_DECISIONS_JSON_SCHEMA,
  STORY_CANDIDATE_JSON_SCHEMA,
  chatCompletionSchema,
  exceptionDecisionsSchema,
  storyCandidateSchema,
  type ChatCompletion,
} from './openrouter-response.schema';
import { buildExceptionPrompt } from './prompts/exception-prompt';
import { buildRepairPrompt } from './prompts/repair-prompt';
import { buildStoryPrompt, type AssembledPrompt } from './prompts/story-prompt';

/**
 * Reply budgets.
 *
 * Generous enough for the longest supported form and its title, tight enough
 * that a model which starts explaining itself is cut off rather than billed for
 * a page of prose.
 */
const MAX_STORY_TOKENS = 4_096;
const MAX_REVIEW_TOKENS = 2_048;

/** Appended on the single recovery request, never on the first attempt. */
const JSON_CONTRACT_REMINDER =
  'Reply with one JSON object and nothing else: no prose, no code fences, no trailing commentary.';

interface StructuredRequest<T> {
  readonly task: AiTask;
  readonly config: TextTaskConfig;
  readonly prompt: AssembledPrompt;
  readonly jsonSchema: Record<string, unknown>;
  readonly maxTokens: number;
  readonly read: (parsed: unknown) => Result<T, string>;
  readonly signal?: AbortSignal;
}

/**
 * Story generation, repair, and exception review over the shared client.
 *
 * Only the request shapes and the reply reading live here; transport,
 * credentials, timeouts, transport retry, and error mapping stay in
 * `OpenRouterClient`, and every judgement about what came back stays in
 * `domain/ai`. The one policy this file owns is format recovery: exactly one
 * extra request per malformed structured reply, deliberately separate from the
 * two content repairs the generation store owns, so the two limits cannot
 * multiply into six.
 */
export class OpenRouterStoryGenerator {
  constructor(private readonly client: OpenRouterClient) {}

  generateStory(
    request: StoryGenerationRequest,
    config: TextTaskConfig,
    signal?: AbortSignal,
  ): Promise<Result<StoryCandidate, AiError>> {
    return this.structured<StoryCandidate>({
      task: 'story-generation',
      config,
      prompt: buildStoryPrompt(request),
      jsonSchema: STORY_CANDIDATE_JSON_SCHEMA,
      maxTokens: MAX_STORY_TOKENS,
      read: storyReader(request.sentenceRange),
      ...(signal === undefined ? {} : { signal }),
    });
  }

  repairStory(
    request: StoryRepairRequest,
    config: TextTaskConfig,
    signal?: AbortSignal,
  ): Promise<Result<StoryCandidate, AiError>> {
    return this.structured<StoryCandidate>({
      task: 'story-repair',
      config,
      prompt: buildRepairPrompt(request),
      jsonSchema: STORY_CANDIDATE_JSON_SCHEMA,
      maxTokens: MAX_STORY_TOKENS,
      read: storyReader(request.original.sentenceRange),
      ...(signal === undefined ? {} : { signal }),
    });
  }

  reviewExceptions(
    request: ExceptionReviewRequest,
    config: TextTaskConfig,
    signal?: AbortSignal,
  ): Promise<Result<readonly ExceptionDecision[], AiError>> {
    return this.structured<readonly ExceptionDecision[]>({
      task: 'exception-review',
      config,
      prompt: buildExceptionPrompt(request),
      jsonSchema: EXCEPTION_DECISIONS_JSON_SCHEMA,
      maxTokens: MAX_REVIEW_TOKENS,
      read: readDecisions,
      ...(signal === undefined ? {} : { signal }),
    });
  }

  /**
   * One task request, with at most one format recovery.
   *
   * Recovery runs only for the two failures a different request shape can
   * actually fix: the provider refusing the schema parameter, and the model
   * answering in the wrong shape. Everything else returns immediately, because
   * repeating it would spend the learner money to reproduce the same answer.
   */
  private async structured<T>(request: StructuredRequest<T>): Promise<Result<T, AiError>> {
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

/**
 * Reads a story and refuses one that is malformed rather than merely wrong.
 *
 * The structural checks run here so that the single format recovery covers
 * everything a differently phrased request could fix — a missing title, an
 * empty sentence, a duplicate or missing index. A story of the wrong length is
 * deliberately not one of those: it is well formed and says the wrong thing, so
 * it travels back as a candidate and spends a content repair instead
 * (ai-pipelines section 5).
 */
function storyReader(range: SentenceRange): (parsed: unknown) => Result<StoryCandidate, string> {
  return (parsed: unknown) => {
    const payload = storyCandidateSchema.safeParse(parsed);
    if (!payload.success) {
      return err('story-shape');
    }
    const candidate = normalizeCandidate(payload.data);
    const issues = checkStoryStructure(candidate, range);
    if (hasFormatFailure(issues)) {
      return err(issues.find((issue) => issue.severity === 'format')?.code ?? 'story-structure');
    }
    return ok(candidate);
  };
}

function readDecisions(parsed: unknown): Result<readonly ExceptionDecision[], string> {
  const payload = exceptionDecisionsSchema.safeParse(parsed);
  if (!payload.success) {
    return err('decisions-shape');
  }
  return ok(
    payload.data.decisions.map((decision) => ({
      candidateId: decision.candidateId,
      decision: decision.decision,
      explanationEn: decision.explanationEn,
      ...(decision.category === undefined ? {} : { category: decision.category }),
    })),
  );
}
