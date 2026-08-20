import type { AiError } from '../../domain/ai/ai-error';
import type { ExceptionDecision } from '../../domain/ai/exception-review';
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
import type { OpenRouterClient } from './openrouter-client';
import {
  EXCEPTION_DECISIONS_JSON_SCHEMA,
  STORY_CANDIDATE_JSON_SCHEMA,
  exceptionDecisionsSchema,
  storyCandidateSchema,
} from './openrouter-response.schema';
import { buildExceptionPrompt } from './prompts/exception-prompt';
import { buildRepairPrompt } from './prompts/repair-prompt';
import { buildStoryPrompt } from './prompts/story-prompt';
import { StructuredTaskRunner } from './structured-request';

/**
 * Reply budgets.
 *
 * Generous enough for the longest supported form and its title, tight enough
 * that a model which starts explaining itself is cut off rather than billed for
 * a page of prose.
 */
const MAX_STORY_TOKENS = 4_096;
const MAX_REVIEW_TOKENS = 2_048;

/**
 * Story generation, repair, and exception review over the shared client.
 *
 * Only the request shapes and the reply reading live here; transport,
 * credentials, timeouts, transport retry, and error mapping stay in
 * `OpenRouterClient`, and every judgement about what came back stays in
 * `domain/ai`. Format recovery — exactly one extra request per malformed
 * structured reply — is owned by `StructuredTaskRunner`, deliberately separate
 * from the two content repairs the generation store owns, so the two limits
 * cannot multiply into six.
 */
export class OpenRouterStoryGenerator {
  private readonly runner: StructuredTaskRunner;

  constructor(client: OpenRouterClient) {
    this.runner = new StructuredTaskRunner(client);
  }

  generateStory(
    request: StoryGenerationRequest,
    config: TextTaskConfig,
    signal?: AbortSignal,
  ): Promise<Result<StoryCandidate, AiError>> {
    return this.runner.run<StoryCandidate>({
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
    return this.runner.run<StoryCandidate>({
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
    return this.runner.run<readonly ExceptionDecision[]>({
      task: 'exception-review',
      config,
      prompt: buildExceptionPrompt(request),
      jsonSchema: EXCEPTION_DECISIONS_JSON_SCHEMA,
      maxTokens: MAX_REVIEW_TOKENS,
      read: readDecisions,
      ...(signal === undefined ? {} : { signal }),
    });
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
      ...(decision.category === undefined || decision.category === null
        ? {}
        : { category: decision.category }),
    })),
  );
}
