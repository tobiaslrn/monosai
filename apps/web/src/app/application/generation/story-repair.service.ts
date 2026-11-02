import { Injectable, inject } from '@angular/core';
import type { AiError } from '../../domain/ai/ai-error';
import type { ExceptionCandidate, ExceptionReviewOutcome } from '../../domain/ai/exception-review';
import { PROMPT_VERSIONS } from '../../domain/ai/prompt-versions';
import type { StoryCandidate, StoryGenerationRequest } from '../../domain/ai/story-request';
import type { StructureIssue } from '../../domain/ai/story-structure';
import type { TextTaskConfig, UnknownSpan } from '../../domain/ai/text-generation-provider';
import type { Token } from '../../domain/reading/token';
import type { TokenStatusAssignment } from '../../domain/reading/validation';
import type { Result } from '../../domain/shared/result';
import { TEXT_GENERATION_PROVIDER } from '../shared/ai-tokens';

/** Title and sentences carry the same analysis; only the title has no row. */
export interface AnalyzedUnit {
  readonly key: string;
  /** Null for the title, which is validated but is not a sentence. */
  readonly sentenceIndex: number | null;
  readonly textJa: string;
  readonly tokens: readonly Token[];
  statuses: readonly TokenStatusAssignment[];
}

/**
 * Identity of one candidate unknown.
 *
 * Surface and lemma together, so two different words that happen to share a
 * surface are asked about separately. The separator is a character Japanese
 * text does not contain, so it cannot be produced by a surface itself.
 */
export function candidateKey(token: Token): string {
  return `${token.surface}|${token.lemma ?? ''}`;
}

/**
 * What one run remembers between repairs.
 *
 * A surface that survived a repair has to be named as such, or nothing stops
 * the next repair reaching for the same replacement. It lives exactly as long
 * as the run that created it, which is why the run owns it and the service,
 * which is shared, does not.
 */
export class RepairMemory {
  private readonly attemptedSurfaces = new Set<string>();

  /** The surfaces among `spans` an earlier repair was already asked to remove. */
  previouslyAttempted(spans: readonly UnknownSpan[]): readonly string[] {
    return [
      ...new Set(
        spans.map((span) => span.surface).filter((surface) => this.attemptedSurfaces.has(surface)),
      ),
    ];
  }

  remember(spans: readonly UnknownSpan[]): void {
    for (const span of spans) {
      this.attemptedSurfaces.add(span.surface);
    }
  }
}

/** Everything one repair request is built from. */
export interface StoryRepairInput {
  readonly request: StoryGenerationRequest;
  readonly candidate: StoryCandidate;
  readonly units: readonly AnalyzedUnit[];
  readonly candidates: readonly ExceptionCandidate[];
  /** The candidate ids still unknown after exception review. */
  readonly remaining: ReadonlySet<string>;
  readonly structureIssues: readonly StructureIssue[];
  readonly attempt: number;
  readonly taskConfig: TextTaskConfig;
  readonly memory: RepairMemory;
}

/**
 * The repair half of the generation loop.
 *
 * `GenerationStore` owns the state machine: when to parse, validate, review,
 * repair, and finalize, and what the learner is told at each step. This service
 * owns what that machine does to the unknown words along the way — finding
 * them, applying the policy's approvals, marking the ones repair could not
 * replace — and the repair request itself. It holds no state of its own, so one
 * instance serves every run; the one memory a run needs is a `RepairMemory` the
 * run creates.
 */
@Injectable({ providedIn: 'root' })
export class StoryRepairService {
  private readonly provider = inject(TEXT_GENERATION_PROVIDER);

  /**
   * One candidate per distinct word, not per occurrence.
   *
   * The policy is asked about a word, and asking twice would let the same word
   * be approved in one sentence and refused in the next.
   */
  collectCandidates(units: readonly AnalyzedUnit[]): readonly ExceptionCandidate[] {
    const byKey = new Map<string, ExceptionCandidate>();

    for (const unit of units) {
      const tokenById = new Map(unit.tokens.map((token) => [token.id, token]));
      for (const status of unit.statuses) {
        if (status.validation.category !== 'unknown') {
          continue;
        }
        const token = tokenById.get(status.tokenId);
        if (token === undefined) {
          continue;
        }
        const key = candidateKey(token);
        const existing = byKey.get(key);
        if (existing !== undefined) {
          if (!existing.contextsJa.includes(unit.textJa) && existing.contextsJa.length < 3) {
            byKey.set(key, { ...existing, contextsJa: [...existing.contextsJa, unit.textJa] });
          }
          continue;
        }
        byKey.set(key, {
          id: key,
          surface: token.surface,
          contextsJa: [unit.textJa],
          ...(token.lemma === undefined ? {} : { lemma: token.lemma }),
          ...(token.readingHiragana === undefined
            ? {}
            : { readingHiragana: token.readingHiragana }),
          ...(token.partOfSpeech === undefined ? {} : { partOfSpeech: token.partOfSpeech }),
        });
      }
    }

    return [...byKey.values()];
  }

  /** Replaces the statuses of approved words, and only those. */
  applyApprovals(units: AnalyzedUnit[], review: ExceptionReviewOutcome): void {
    if (review.approvals.size === 0) {
      return;
    }
    for (const unit of units) {
      const tokenById = new Map(unit.tokens.map((token) => [token.id, token]));
      unit.statuses = unit.statuses.map((status) => {
        if (status.validation.category !== 'unknown') {
          return status;
        }
        const token = tokenById.get(status.tokenId);
        const approval =
          token === undefined ? undefined : review.approvals.get(candidateKey(token));
        return approval === undefined ? status : { tokenId: status.tokenId, validation: approval };
      });
    }
  }

  /**
   * Re-labels the words repair could not replace, on the way into the library.
   *
   * A story is saved with these still marked unknown rather than being thrown
   * away: the reader underlines them and the learner decides what to do about
   * them. The reason distinguishes them from a word that was merely never
   * looked at, so a saved story records that repair was spent and lost.
   */
  markUnresolved(units: AnalyzedUnit[], remaining: ReadonlySet<string>): void {
    if (remaining.size === 0) {
      return;
    }
    for (const unit of units) {
      const tokenById = new Map(unit.tokens.map((token) => [token.id, token]));
      unit.statuses = unit.statuses.map((status) => {
        if (status.validation.category !== 'unknown') {
          return status;
        }
        const token = tokenById.get(status.tokenId);
        if (token === undefined || !remaining.has(candidateKey(token))) {
          return status;
        }
        return {
          tokenId: status.tokenId,
          validation: { category: 'unknown', reason: 'unresolved-after-repair' },
        };
      });
    }
  }

  /**
   * Asks the provider to repair the candidate.
   *
   * The request names exactly which words must go and where, and which of them
   * an earlier repair in the same run already failed to remove. The result is a
   * new candidate and nothing more: the caller reparses and revalidates all of
   * it, because a model's claim to have fixed a word is not evidence that it
   * did.
   */
  repair(input: StoryRepairInput, signal: AbortSignal): Promise<Result<StoryCandidate, AiError>> {
    const spans = this.unknownSpans(input.units, input.candidates, input.remaining);
    const previouslyAttempted = input.memory.previouslyAttempted(spans);
    input.memory.remember(spans);

    return this.provider.repairStory(
      {
        original: input.request,
        candidate: input.candidate,
        unknownSpans: spans,
        structureIssues: input.structureIssues,
        attempt: input.attempt,
        previouslyAttempted,
        promptVersion: PROMPT_VERSIONS.repair,
      },
      input.taskConfig,
      signal,
    );
  }

  private unknownSpans(
    units: readonly AnalyzedUnit[],
    candidates: readonly ExceptionCandidate[],
    remaining: ReadonlySet<string>,
  ): readonly UnknownSpan[] {
    const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
    const spans: UnknownSpan[] = [];
    const seen = new Set<string>();

    for (const unit of units) {
      const tokenById = new Map(unit.tokens.map((token) => [token.id, token]));
      for (const status of unit.statuses) {
        if (status.validation.category !== 'unknown') {
          continue;
        }
        const token = tokenById.get(status.tokenId);
        if (token === undefined) {
          continue;
        }
        const key = candidateKey(token);
        if (!remaining.has(key) || seen.has(`${unit.key}:${key}`)) {
          continue;
        }
        seen.add(`${unit.key}:${key}`);
        spans.push({
          sentenceIndex: unit.sentenceIndex,
          surface: byId.get(key)?.surface ?? token.surface,
        });
      }
    }
    return spans;
  }
}
