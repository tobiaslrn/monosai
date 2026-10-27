import type { AiError } from '../../domain/ai/ai-error';
import {
  applyDecisions,
  noApprovals,
  type ExceptionReviewOutcome,
} from '../../domain/ai/exception-review';
import { PROMPT_VERSIONS } from '../../domain/ai/prompt-versions';
import type { StoryCandidate, StoryGenerationRequest } from '../../domain/ai/story-request';
import { checkStoryStructure } from '../../domain/ai/story-structure';
import type {
  TextGenerationProvider,
  TextTaskConfig,
} from '../../domain/ai/text-generation-provider';
import type { LanguageError } from '../../domain/language/language-error';
import type { SnapshotId } from '../../domain/shared/ids';
import {
  analyzeStory,
  applyApprovals,
  collectCandidates,
  markUnresolved,
  unknownSpans,
  type AnalysisPorts,
  type AnalyzedUnit,
} from './analyzed-story';

/**
 * Reads the current abort state.
 *
 * `AbortSignal.aborted` is typed as a plain boolean, so checking it twice in one
 * function narrows it to `false` for the second check even though it can flip
 * between them. Going through a call keeps every check honest.
 */
export function isAborted(signal: AbortSignal): boolean {
  return signal.aborted;
}

/** The stages the loop moves the run through, as the state machine names them. */
export type RepairStage =
  | { readonly kind: 'parsing' }
  | { readonly kind: 'validating' }
  | { readonly kind: 'exception-review'; readonly candidateCount: number }
  | {
      readonly kind: 'repairing';
      readonly attempt: number;
      readonly totalAttempts: number;
      readonly unknownCount: number;
      readonly structureIssueCount: number;
    };

/** How the loop reports progress; the store owns what that does to its state. */
export interface RepairProgress {
  /** The run entered a stage. The announcement, when there is one, replaces the last. */
  stage(stage: RepairStage, announcement?: string): void;
  /** Exception reviews run and content repairs spent so far, in this run. */
  counted(counts: { readonly reviews: number; readonly repairs: number }): void;
}

/** What the loop asks of the provider, narrowed to the calls it makes. */
export type RepairProvider = Pick<TextGenerationProvider, 'reviewExceptions' | 'repairStory'>;

/** What the loop drives, narrowed to the calls it makes. */
export interface StoryRepairLoopPorts extends AnalysisPorts {
  readonly provider: RepairProvider;
  readonly progress: RepairProgress;
}

/** One run's inputs, all captured before the first request. */
export interface RepairRun {
  readonly firstCandidate: StoryCandidate;
  /** Sent back with every repair, so the model sees what it was originally asked. */
  readonly request: StoryGenerationRequest;
  readonly snapshotId: SnapshotId;
  /** Empty when no policy is configured, which skips the review altogether. */
  readonly policyText: string;
  readonly taskConfig: TextTaskConfig;
  /** The most content repairs this run may spend. */
  readonly repairBudget: number;
  readonly signal: AbortSignal;
}

/** A story the loop is done with, ready to be assembled. */
export interface SettledStory {
  /** The title and every sentence with their final statuses. */
  readonly units: readonly AnalyzedUnit[];
  /** Words the exception policy approved in the final pass. */
  readonly exceptionCount: number;
  /** Content repairs spent. Format recovery happens in the provider and is not counted. */
  readonly repairAttempts: number;
}

/** What the loop came to. */
export type RepairOutcome =
  /** Nothing is outstanding: every word is readable and the structure is sound. */
  | ({ readonly kind: 'accepted' } & SettledStory)
  /**
   * The budget is spent with something still outstanding. The words repair could
   * not replace are already marked, and the story is saved with them.
   */
  | ({ readonly kind: 'exhausted' } & SettledStory)
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'failed'; readonly error: AiError | LanguageError };

const CANCELLED: RepairOutcome = { kind: 'cancelled' };

/**
 * Parse, validate, review, and repair until the candidate is accepted, the
 * repair budget runs out, or something fails. A budget that runs out with
 * words still unknown is not a rejection: the story is saved with those words
 * marked.
 *
 * Every pass reparses and revalidates the whole returned story. Nothing from
 * an earlier pass survives into a later one: a repair's token analysis,
 * classification, and exception decisions are all computed again from the
 * Japanese that just arrived, because a model's claim to have fixed one word
 * is not evidence that it did.
 *
 * The loop holds no state between runs and never touches the state machine: it
 * reports each stage through `progress` and says how it ended, and the store
 * turns that into `failed`, `cancelled`, or a save. The one signal it does not
 * re-check is a successful provider answer that arrived after an abort; the
 * next pass's analysis, or the store before its transaction, sees the abort.
 */
export class StoryRepairLoop {
  constructor(private readonly ports: StoryRepairLoopPorts) {}

  async run(input: RepairRun): Promise<RepairOutcome> {
    const { progress, provider } = this.ports;
    const { signal } = input;
    let candidate = input.firstCandidate;
    let reviews = 0;
    let repairs = 0;
    // Two memories that live exactly as long as this run. A word the policy has
    // already refused would get the same answer from the same policy text, so
    // asking again is a request the learner pays for twice; and a surface that
    // survived a repair has to be named as such, or nothing stops the next
    // repair reaching for the same replacement.
    const settledRejections = new Set<string>();
    const attemptedSurfaces = new Set<string>();

    for (;;) {
      progress.stage({ kind: 'parsing' });
      const structureIssues = checkStoryStructure(candidate);

      progress.stage({ kind: 'validating' }, 'Checking every word against your vocabulary…');
      const analyzed = await analyzeStory(this.ports, input.snapshotId, candidate, signal);
      if (!analyzed.ok) {
        return this.stopped(analyzed.error, signal);
      }
      if (isAborted(signal)) {
        return CANCELLED;
      }

      const units = analyzed.value;
      const candidates = collectCandidates(units);
      const unsettled = candidates.filter((candidate) => !settledRejections.has(candidate.id));

      let review: ExceptionReviewOutcome = noApprovals(unsettled);
      if (unsettled.length > 0 && input.policyText !== '') {
        reviews += 1;
        progress.stage(
          { kind: 'exception-review', candidateCount: unsettled.length },
          `Asking your exception policy about ${String(unsettled.length)} unfamiliar words…`,
        );
        progress.counted({ reviews, repairs });
        const reviewed = await provider.reviewExceptions(
          {
            policyText: input.policyText,
            candidates: unsettled,
            promptVersion: PROMPT_VERSIONS['exception-review'],
          },
          input.taskConfig,
          signal,
        );
        if (reviewed.ok) {
          review = applyDecisions(unsettled, reviewed.value);
          for (const rejected of review.rejections) {
            settledRejections.add(rejected);
          }
        } else if (reviewed.error.code === 'cancelled' || isAborted(signal)) {
          return CANCELLED;
        }
        // Any other review failure is not fatal: every candidate simply stays
        // unknown and goes to repair. Inferring approval from a failed request
        // is the one thing that must never happen here.
      }

      applyApprovals(units, review);
      // Words the policy already refused never reached this pass's review, so
      // they are added back here: skipping the request must not quietly turn a
      // refusal into an acceptance.
      const remaining = new Set([
        ...review.stillUnknown,
        ...candidates
          .filter((candidate) => settledRejections.has(candidate.id))
          .map((candidate) => candidate.id),
      ]);
      const budgetSpent = repairs >= input.repairBudget;
      const outstanding = remaining.size > 0 || structureIssues.length > 0;

      if (!outstanding || budgetSpent) {
        markUnresolved(units, remaining);
        return {
          kind: outstanding ? 'exhausted' : 'accepted',
          units,
          exceptionCount: review.approvals.size,
          repairAttempts: repairs,
        };
      }

      const attempt = repairs + 1;
      const unknownCount = remaining.size;
      const structureIssueCount = structureIssues.length;
      repairs = attempt;
      const repairWork =
        unknownCount > 0
          ? `Replacing ${String(unknownCount)} unfamiliar ${unknownCount === 1 ? 'word' : 'words'}${structureIssueCount > 0 ? ' and fixing the story structure' : ''}`
          : 'Fixing the story structure';
      progress.counted({ reviews, repairs });
      progress.stage(
        {
          kind: 'repairing',
          attempt,
          totalAttempts: input.repairBudget,
          unknownCount,
          structureIssueCount,
        },
        `${repairWork} (attempt ${String(attempt)} of ${String(input.repairBudget)})…`,
      );

      const spans = unknownSpans(units, candidates, remaining);
      const previouslyAttempted = [
        ...new Set(
          spans.map((span) => span.surface).filter((surface) => attemptedSurfaces.has(surface)),
        ),
      ];
      for (const span of spans) {
        attemptedSurfaces.add(span.surface);
      }

      const repaired = await provider.repairStory(
        {
          original: input.request,
          candidate,
          unknownSpans: spans,
          structureIssues,
          attempt,
          previouslyAttempted,
          promptVersion: PROMPT_VERSIONS.repair,
        },
        input.taskConfig,
        signal,
      );
      if (!repaired.ok) {
        return this.stopped(repaired.error, signal);
      }
      candidate = repaired.value;
    }
  }

  /** A failed step is a cancellation or a real failure, never both. */
  private stopped(error: AiError | LanguageError, signal: AbortSignal): RepairOutcome {
    if (error.domain === 'ai' && error.code === 'cancelled') {
      return CANCELLED;
    }
    if (isAborted(signal)) {
      return CANCELLED;
    }
    return { kind: 'failed', error };
  }
}
