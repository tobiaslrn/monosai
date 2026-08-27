import type { AiError } from '../../domain/ai/ai-error';
import type { ExceptionDecision } from '../../domain/ai/exception-review';
import type {
  SentenceRange,
  StoryBlueprint,
  StoryCandidate,
  StoryGenerationRequest,
  StorySegmentCandidate,
  StorySegmentPlan,
} from '../../domain/ai/story-request';
import { MAX_STORY_SEGMENT_SENTENCES, planStorySegments } from '../../domain/ai/story-request';
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
import { DEFAULT_STORY_TOKEN_BUDGET } from '../../domain/settings/settings';
import { STORY_BLUEPRINT_TEMPERATURE } from '../../domain/ai/sampling';
import { err, ok, type Result } from '../../domain/shared/result';
import type { OpenRouterClient } from './openrouter-client';
import {
  applyScopedRepair,
  planScopedRepair,
  scopedRepairTargets,
  type ScopedRepairEntry,
} from '../../domain/ai/repair-scope';
import {
  exceptionDecisionsJsonSchema,
  exceptionDecisionsSchema,
  storyBlueprintSchema,
  storyBlueprintJsonSchema,
  storyCandidateJsonSchema,
  storyCandidateSchema,
  storyRepairPatchSchema,
  storyRepairPatchJsonSchema,
  storySegmentCandidateSchema,
  storySegmentJsonSchema,
} from './openrouter-response.schema';
import { buildBlueprintPrompt } from './prompts/blueprint-prompt';
import { buildExceptionPrompt, exceptionCandidateWireId } from './prompts/exception-prompt';
import { buildRepairPrompt, buildScopedRepairPrompt } from './prompts/repair-prompt';
import { buildSegmentPrompt } from './prompts/segment-prompt';
import { buildStoryPrompt } from './prompts/story-prompt';
import { StructuredTaskRunner } from './structured-request';

/**
 * Reply budgets.
 *
 * Generous enough for the longest supported form and its title, while still
 * bounded by the learner-controlled setting. The default leaves room for
 * reasoning models to finish their JSON instead of using the whole budget on
 * hidden reasoning.
 */
const MAX_REVIEW_TOKENS = 2_048;
const MAX_BLUEPRINT_TOKENS = 4_096;

/**
 * How much preceding Japanese a segment request carries.
 *
 * Enough to keep track of who is speaking and which pronouns are live across a
 * segment boundary. It is a rounding error beside the vocabulary inventory the
 * same request sends, so erring on the generous side costs almost nothing.
 */
const PRECEDING_SENTENCES = 6;

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

  async generateStory(
    request: StoryGenerationRequest,
    config: TextTaskConfig,
    signal?: AbortSignal,
  ): Promise<Result<StoryCandidate, AiError>> {
    if (request.sentenceRange.max > MAX_STORY_SEGMENT_SENTENCES) {
      return this.generateLongStory(request, config, signal);
    }
    return this.generateBoundedStory(request, config, signal);
  }

  private generateBoundedStory(
    request: StoryGenerationRequest,
    config: TextTaskConfig,
    signal?: AbortSignal,
  ): Promise<Result<StoryCandidate, AiError>> {
    return this.runner.run<StoryCandidate>({
      task: 'story-generation',
      config,
      prompt: buildStoryPrompt(request),
      jsonSchema: storyCandidateJsonSchema(request.sentenceRange),
      maxTokens: config.storyTokenBudget ?? DEFAULT_STORY_TOKEN_BUDGET,
      read: storyReader(request.sentenceRange),
      ...(signal === undefined ? {} : { signal }),
    });
  }

  /**
   * Repairs a candidate, rewriting as little of it as the problems allow.
   *
   * A story whose only fault is vocabulary is repaired sentence by sentence:
   * the returned patch is spliced in and then revalidated in full, so the
   * checks are unchanged while the untouched sentences lose their chance to
   * acquire a new unknown. A wrong sentence count is a property of the whole
   * story, so those still travel as a whole story.
   */
  async repairStory(
    request: StoryRepairRequest,
    config: TextTaskConfig,
    signal?: AbortSignal,
  ): Promise<Result<StoryCandidate, AiError>> {
    if (request.original.sentenceRange.max > MAX_STORY_SEGMENT_SENTENCES) {
      return this.repairLongStory(request, config, signal);
    }
    if (request.structureIssues.length === 0 && request.unknownSpans.length > 0) {
      return this.repairScoped(request, config, signal);
    }
    return this.repairBoundedStory(request, config, signal);
  }

  private async repairScoped(
    request: StoryRepairRequest,
    config: TextTaskConfig,
    signal?: AbortSignal,
  ): Promise<Result<StoryCandidate, AiError>> {
    const entries = planScopedRepair(request.candidate, request.unknownSpans);
    if (scopedRepairTargets(entries).length === 0) {
      return ok(request.candidate);
    }
    const patched = await this.runner.run<StoryCandidate>({
      task: 'story-repair',
      config,
      prompt: buildScopedRepairPrompt(request, entries),
      jsonSchema: storyRepairPatchJsonSchema(scopedRepairTargets(entries).length),
      maxTokens: config.storyTokenBudget ?? DEFAULT_STORY_TOKEN_BUDGET,
      read: scopedRepairReader(request.candidate, entries),
      ...(signal === undefined ? {} : { signal }),
    });
    return patched;
  }

  private repairBoundedStory(
    request: StoryRepairRequest,
    config: TextTaskConfig,
    signal?: AbortSignal,
  ): Promise<Result<StoryCandidate, AiError>> {
    return this.runner.run<StoryCandidate>({
      task: 'story-repair',
      config,
      prompt: buildRepairPrompt(request),
      jsonSchema: storyCandidateJsonSchema(request.original.sentenceRange),
      maxTokens: config.storyTokenBudget ?? DEFAULT_STORY_TOKEN_BUDGET,
      read: storyReader(request.original.sentenceRange),
      ...(signal === undefined ? {} : { signal }),
    });
  }

  private async generateLongStory(
    request: StoryGenerationRequest,
    config: TextTaskConfig,
    signal?: AbortSignal,
  ): Promise<Result<StoryCandidate, AiError>> {
    const planned = planStorySegments(request.sentenceRange.max);
    const blueprint = await this.runner.run<StoryBlueprint>({
      task: 'story-generation',
      config,
      prompt: buildBlueprintPrompt(request, planned),
      jsonSchema: storyBlueprintJsonSchema(planned.length),
      maxTokens: MAX_BLUEPRINT_TOKENS,
      temperature: STORY_BLUEPRINT_TEMPERATURE,
      read: blueprintReader(planned),
      ...(signal === undefined ? {} : { signal }),
    });
    if (!blueprint.ok) {
      return blueprint;
    }

    const sentences: StoryCandidate['sentences'][number][] = [];
    let continuitySummaryEn = '';
    let precedingSentencesJa: readonly string[] = [];
    for (const segment of blueprint.value.segments) {
      const generated = await this.runner.run<StorySegmentCandidate>({
        task: 'story-generation',
        config,
        prompt: buildSegmentPrompt({
          original: request,
          blueprint: blueprint.value,
          segment,
          continuitySummaryEn,
          precedingSentencesJa,
        }),
        jsonSchema: storySegmentJsonSchema(segment.sentenceCount),
        maxTokens: config.storyTokenBudget ?? DEFAULT_STORY_TOKEN_BUDGET,
        read: segmentReader(segment.sentenceCount),
        ...(signal === undefined ? {} : { signal }),
      });
      if (!generated.ok) {
        return generated;
      }
      let segmentSentences = generated.value.sentences;
      if (segmentSentences.length !== segment.sentenceCount) {
        const repaired = await this.repairBoundedStory(
          {
            original: {
              ...request,
              sentenceRange: { min: segment.sentenceCount, max: segment.sentenceCount },
            },
            candidate: { titleJa: blueprint.value.titleJa, sentences: segmentSentences },
            unknownSpans: [],
            structureIssues: [
              {
                code: 'sentence-count-out-of-range',
                severity: 'repairable',
                message: `Segment ${String(segment.index)} must contain exactly ${String(segment.sentenceCount)} sentences.`,
              },
            ],
            attempt: 1,
            previouslyAttempted: [],
            promptVersion: request.promptVersion.replace(/^story\//u, 'repair/'),
          },
          config,
          signal,
        );
        if (!repaired.ok) {
          return repaired;
        }
        segmentSentences = repaired.value.sentences;
      }
      const offset = sentences.length;
      sentences.push(
        ...segmentSentences.map((sentence) => ({
          index: offset + sentence.index,
          textJa: sentence.textJa,
        })),
      );
      continuitySummaryEn = generated.value.continuitySummaryEn;
      precedingSentencesJa = sentences
        .slice(-PRECEDING_SENTENCES)
        .map((sentence) => sentence.textJa);
    }
    return ok({ titleJa: blueprint.value.titleJa, sentences });
  }

  private async repairLongStory(
    request: StoryRepairRequest,
    config: TextTaskConfig,
    signal?: AbortSignal,
  ): Promise<Result<StoryCandidate, AiError>> {
    const plans = planStorySegments(request.original.sentenceRange.max);
    const ordered = [...request.candidate.sentences]
      .sort((left, right) => left.index - right.index)
      .map((sentence) => sentence.textJa);
    const repairedSentences: StoryCandidate['sentences'][number][] = [];
    let titleJa = request.candidate.titleJa;
    let offset = 0;

    for (const plan of plans) {
      const texts = ordered.slice(offset, offset + plan.sentenceCount);
      const spans = request.unknownSpans
        .filter(
          (span) =>
            (span.sentenceIndex === null && plan.index === 0) ||
            (span.sentenceIndex !== null &&
              span.sentenceIndex >= offset &&
              span.sentenceIndex < offset + plan.sentenceCount),
        )
        .map((span) => ({
          ...span,
          sentenceIndex:
            span.sentenceIndex === null ? null : Math.max(0, span.sentenceIndex - offset),
        }));
      const countMismatch = texts.length !== plan.sentenceCount;
      const carriesStructureIssue =
        request.structureIssues.length > 0 && plan.index === plans.length - 1;
      const shouldRepair = spans.length > 0 || countMismatch || carriesStructureIssue;

      if (!shouldRepair) {
        repairedSentences.push(
          ...texts.map((textJa, index) => ({ index: offset + index, textJa })),
        );
        offset += plan.sentenceCount;
        continue;
      }

      const segmentOriginal: StoryGenerationRequest = {
        ...request.original,
        sentenceRange: { min: plan.sentenceCount, max: plan.sentenceCount },
      };
      const segmentRequest: StoryRepairRequest = {
        ...request,
        original: segmentOriginal,
        candidate: {
          titleJa,
          sentences: texts.map((textJa, index) => ({ index, textJa })),
        },
        unknownSpans: spans,
        structureIssues: countMismatch || carriesStructureIssue ? request.structureIssues : [],
      };
      const repaired =
        segmentRequest.structureIssues.length === 0 && segmentRequest.unknownSpans.length > 0
          ? await this.repairScoped(segmentRequest, config, signal)
          : await this.repairBoundedStory(segmentRequest, config, signal);
      if (!repaired.ok) {
        return repaired;
      }
      if (plan.index === 0) {
        titleJa = repaired.value.titleJa;
      }
      repairedSentences.push(
        ...repaired.value.sentences.map((sentence) => ({
          index: offset + sentence.index,
          textJa: sentence.textJa,
        })),
      );
      offset += plan.sentenceCount;
    }

    return ok({ titleJa, sentences: repairedSentences });
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
      jsonSchema: exceptionDecisionsJsonSchema(request.candidates.length),
      maxTokens: MAX_REVIEW_TOKENS,
      read: decisionsReader(request),
      ...(signal === undefined ? {} : { signal }),
    });
  }
}

function blueprintReader(
  planned: readonly StorySegmentPlan[],
): (parsed: unknown) => Result<StoryBlueprint, string> {
  return (parsed: unknown) => {
    const payload = storyBlueprintSchema.safeParse(parsed);
    if (!payload.success || payload.data.titleJa.trim() === '') {
      return err('story-blueprint-shape');
    }
    if (payload.data.segments.length !== planned.length) {
      return err('story-blueprint-segment-count');
    }
    for (const [index, expected] of planned.entries()) {
      const received = payload.data.segments[index];
      if (
        received.index !== expected.index ||
        received.sentenceCount !== expected.sentenceCount ||
        received.beatEn.trim() === ''
      ) {
        return err('story-blueprint-plan-mismatch');
      }
    }
    return ok({
      titleJa: payload.data.titleJa.trim(),
      segments: payload.data.segments.map((segment) => ({
        index: segment.index,
        sentenceCount: segment.sentenceCount,
        beatEn: segment.beatEn.trim(),
      })),
    });
  };
}

function segmentReader(
  sentenceCount: number,
): (parsed: unknown) => Result<StorySegmentCandidate, string> {
  return (parsed: unknown) => {
    const payload = storySegmentCandidateSchema.safeParse(parsed);
    if (!payload.success) {
      return err('story-segment-shape');
    }
    const normalized = normalizeCandidate({
      titleJa: 'segment',
      sentences: payload.data.sentences,
    });
    const issues = checkStoryStructure(normalized, { min: sentenceCount, max: sentenceCount });
    if (hasFormatFailure(issues)) {
      return err(
        issues.find((issue) => issue.severity === 'format')?.code ?? 'story-segment-structure',
      );
    }
    return ok({
      sentences: normalized.sentences,
      continuitySummaryEn: payload.data.continuitySummaryEn.trim(),
    });
  };
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

/**
 * Restores the caller's candidate keys from the ordinals the prompt sent.
 *
 * An ordinal that was never issued is passed through unchanged rather than
 * dropped: `applyDecisions` already treats an answer about a candidate that was
 * not asked about as a discarded decision, and that judgement stays in the
 * domain.
 */
function decisionsReader(
  request: ExceptionReviewRequest,
): (parsed: unknown) => Result<readonly ExceptionDecision[], string> {
  const byWireId = new Map(
    request.candidates.map(
      (candidate, index) => [exceptionCandidateWireId(index), candidate.id] as const,
    ),
  );

  return (parsed: unknown) => {
    const payload = exceptionDecisionsSchema.safeParse(parsed);
    if (!payload.success) {
      return err('decisions-shape');
    }
    return ok(
      payload.data.decisions.map((decision) => ({
        candidateId: byWireId.get(decision.candidateId) ?? decision.candidateId,
        decision: decision.decision,
        explanationEn: decision.explanationEn,
      })),
    );
  };
}

/**
 * Reads a scoped repair's patch and splices it into the candidate.
 *
 * A patch that does not answer exactly what was asked is refused here rather
 * than partly applied, so the single format recovery covers it. What comes back
 * is a complete story again, which the caller revalidates from scratch exactly
 * as it would a rewritten one.
 */
function scopedRepairReader(
  candidate: StoryCandidate,
  entries: readonly ScopedRepairEntry[],
): (parsed: unknown) => Result<StoryCandidate, string> {
  return (parsed: unknown) => {
    const payload = storyRepairPatchSchema.safeParse(parsed);
    if (!payload.success) {
      return err('story-repair-patch-shape');
    }
    const spliced = applyScopedRepair(candidate, entries, payload.data);
    return spliced.ok ? ok(normalizeCandidate(spliced.value)) : spliced;
  };
}
