import type { Result } from '../shared/result';
import type { AiError } from './ai-error';
import type { ExceptionCandidate, ExceptionDecision } from './exception-review';
import type { ModelTest, StructuredOutputMode, TextModelConfig } from './model-test';
import type { StructureIssue } from './story-structure';
import type { StoryCandidate, StoryGenerationRequest } from './story-request';

/**
 * How one generation task should talk to the model.
 *
 * The structured-output mode is carried rather than rediscovered: the
 * configuration test already proved which mode this model can be held to, and
 * spending a format-recovery request every run to learn it again would be a
 * request the learner pays for and never sees. See ADR 0020.
 */
export interface TextTaskConfig {
  readonly modelId: string;
  readonly structuredOutput: StructuredOutputMode;
}

/** One word the model must remove or replace, with the reason it must go. */
export interface UnknownSpan {
  /** Index of the offending sentence, or `null` when it is in the title. */
  readonly sentenceIndex: number | null;
  readonly surface: string;
  readonly reason: string;
}

/**
 * A targeted repair of a candidate the local checks refused.
 *
 * The whole current story travels with it, because a repair returns a whole
 * story: nothing is ever patched into a previous candidate, and the returned
 * Japanese is reparsed and revalidated from scratch (ai-pipelines section 7).
 */
export interface StoryRepairRequest {
  readonly original: StoryGenerationRequest;
  readonly candidate: StoryCandidate;
  readonly unknownSpans: readonly UnknownSpan[];
  readonly structureIssues: readonly StructureIssue[];
  readonly attempt: number;
  readonly promptVersion: string;
}

export interface ExceptionReviewRequest {
  readonly policyText: string;
  readonly candidates: readonly ExceptionCandidate[];
  readonly promptVersion: string;
}

/**
 * The text side of the AI boundary.
 *
 * Grammar review and translation are added to this port by Milestone 8, so no
 * method here is ever unimplemented.
 */
export interface TextGenerationProvider {
  testConfiguration(
    config: TextModelConfig,
    signal?: AbortSignal,
  ): Promise<Result<ModelTest, AiError>>;

  generateStory(
    request: StoryGenerationRequest,
    config: TextTaskConfig,
    signal?: AbortSignal,
  ): Promise<Result<StoryCandidate, AiError>>;

  repairStory(
    request: StoryRepairRequest,
    config: TextTaskConfig,
    signal?: AbortSignal,
  ): Promise<Result<StoryCandidate, AiError>>;

  reviewExceptions(
    request: ExceptionReviewRequest,
    config: TextTaskConfig,
    signal?: AbortSignal,
  ): Promise<Result<readonly ExceptionDecision[], AiError>>;
}
