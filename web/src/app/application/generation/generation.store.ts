import { Injectable, computed, inject, signal } from '@angular/core';
import { aiError } from '../../domain/ai/ai-error';
import {
  applyDecisions,
  noApprovals,
  type ExceptionReviewOutcome,
} from '../../domain/ai/exception-review';
import { PROMPT_VERSIONS } from '../../domain/ai/prompt-versions';
import type { StoryDirectionRecord } from '../../domain/ai/story-direction';
import {
  storyFormForSentenceCount,
  validateStoryInput,
  type StoryCandidate,
  type StoryGenerationRequest,
  type StoryInputDraft,
} from '../../domain/ai/story-request';
import { checkStoryStructure } from '../../domain/ai/story-structure';
import { VALIDATOR_VERSION } from '../../domain/language/analyzer-version';
import type { GeneratedStory } from '../../domain/reading/reading';
import type { GeneratedStoryDraft } from '../../domain/reading/reading-repository';
import type { VocabularyItemId } from '../../domain/shared/ids';
import { LanguageStore } from '../language/language.store';
import { AppSettingsStore } from '../settings/app-settings.store';
import { TEXT_GENERATION_PROVIDER } from '../shared/ai-tokens';
import { GenerationContextService, type CapturedContext } from './generation-context.service';
import {
  CANCELLABLE,
  IDLE,
  repairAnnouncement,
  type GenerationFailure,
  type GenerationState,
  type RunningStateKind,
} from './generation-state';
import { StoryAnalysisService } from './story-analysis.service';
import { StoryAssemblyService, type AcceptedSentence } from './story-assembly.service';
import { RepairMemory, StoryRepairService, type AnalyzedUnit } from './story-repair.service';
import { VocabularyPreparationService } from './vocabulary-preparation.service';
import { LOGGER, NOOP_LOGGER, type Logger } from '../shared/diagnostics';
import { defined } from '../../domain/shared/invariant';

/**
 * Reads the current abort state.
 *
 * `AbortSignal.aborted` is typed as a plain boolean, so checking it twice in one
 * function narrows it to `false` for the second check even though it can flip
 * between them. Going through a call keeps every check honest.
 */
function isAborted(signal: AbortSignal): boolean {
  return signal.aborted;
}

/**
 * One generation, from prerequisites through to a saved story.
 *
 * One instance is one run. `GenerationJobsStore` creates a store per job in its
 * own environment injector rather than sharing a singleton, so several stories
 * can be written at once without sharing an abort controller or a draft. Every
 * captured input is taken before the first request, so changing a setting
 * mid-run cannot change what the running story is judged against.
 */
@Injectable()
export class GenerationStore {
  private readonly provider = inject(TEXT_GENERATION_PROVIDER);
  private readonly preparation = inject(VocabularyPreparationService);
  private readonly assembly = inject(StoryAssemblyService);
  private readonly storyRepair = inject(StoryRepairService);
  private readonly contexts = inject(GenerationContextService);
  private readonly analysis = inject(StoryAnalysisService);
  private readonly appSettings = inject(AppSettingsStore);
  private readonly language = inject(LanguageStore);
  private readonly logger = inject<Logger>(LOGGER, { optional: true }) ?? NOOP_LOGGER;

  private readonly stateSignal = signal<GenerationState>(IDLE);
  private readonly announcementSignal = signal('');
  private readonly repairSignal = signal(0);
  private readonly reviewSignal = signal(0);

  private controller: AbortController | null = null;
  /**
   * The assembled draft, kept in memory so a `finalizing` failure can be
   * retried without writing the story again. Cleared once it is safely saved.
   */
  private builtDraft: GeneratedStoryDraft | null = null;

  /** Told once the story is safely written, by whoever owns this run. */
  onSaved: ((reading: GeneratedStory) => void) | null = null;

  readonly state = this.stateSignal.asReadonly();
  readonly announcement = this.announcementSignal.asReadonly();
  /** Content repairs spent so far in this run. Format recovery is not counted. */
  readonly repairAttempts = this.repairSignal.asReadonly();
  /** Exception reviews run so far, so the stepper can say Skipped honestly. */
  readonly exceptionReviews = this.reviewSignal.asReadonly();

  readonly isBusy = computed(() => {
    const kind = this.stateSignal().kind;
    return kind !== 'idle' && kind !== 'saved' && kind !== 'cancelled' && kind !== 'failed';
  });
  readonly canCancel = computed(() => CANCELLABLE.has(this.stateSignal().kind));
  /** Whether `retrySave` can currently do anything. */
  readonly canRetrySave = computed(() => {
    const state = this.stateSignal();
    return state.kind === 'failed' && state.during === 'finalizing' && this.builtDraft !== null;
  });

  /**
   * Runs one generation.
   *
   * Nothing is written until the last step. Words the repair budget could not
   * replace do not stop the save: they are written as `unresolved-after-repair`
   * and the reader marks them. Only a structural failure keeps a story out.
   */
  async generate(
    sentenceCount: number,
    draft: StoryInputDraft,
    modelPresetId: string | null = null,
  ): Promise<void> {
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    const signal = controller.signal;
    // Read the mode synchronously with the other run inputs. Settings are
    // optimistic, so a later UI change cannot alter this in-flight request.
    const capturedPriorityMode = this.appSettings.ankiWordPriorityMode();
    const capturedFocusSize = this.appSettings.recentFocusSize();

    this.logger.info('job.started', { kind: 'generation', count: sentenceCount });

    this.repairSignal.set(0);
    this.reviewSignal.set(0);
    this.stateSignal.set({ kind: 'checking-prerequisites' });
    this.announce('Checking what this story needs…');

    const captured = await this.contexts.capture(
      modelPresetId,
      capturedPriorityMode,
      capturedFocusSize,
    );
    if (!captured.ok) {
      this.fail(captured.error);
      return;
    }
    if (isAborted(signal)) {
      this.cancelled();
      return;
    }

    const input = validateStoryInput(draft);
    if (!input.ok) {
      this.fail(
        aiError('unknown', 'story-generation', input.error[0].message, {
          detail: { issueCode: input.error[0].code },
        }),
      );
      return;
    }

    this.stateSignal.set({ kind: 'preparing' });
    this.announce('Preparing your reviewed vocabulary…');

    const context = captured.value;
    const form = storyFormForSentenceCount(sentenceCount);
    const prepared = await this.preparation.prepare(
      context.snapshot.id,
      form,
      context.ankiWordPriorityMode,
      context.recentFocusSize,
    );
    if (!prepared.ok) {
      this.fail(prepared.error);
      return;
    }
    if (isAborted(signal)) {
      this.cancelled();
      return;
    }

    const request: StoryGenerationRequest = {
      form,
      requestedSentenceCount: sentenceCount,
      premise: input.value.premise,
      ...(input.value.chosenPlot === undefined ? {} : { direction: input.value.chosenPlot.frame }),
      allowedVocabulary: prepared.value.allowedVocabulary,
      suggestedVocabulary: prepared.value.suggestedVocabulary,
      focusVocabulary: prepared.value.focusVocabulary,
      structuralBaseline: this.baselineForms(),
      grammarGuidance: context.profile.resolvedGuidance,
      registerPreference: context.profile.registerPreference,
      snapshotId: context.snapshot.id,
      grammarProfileHash: context.profile.profileHash,
      promptVersion: PROMPT_VERSIONS.story,
      ...(input.value.specialInstructions === undefined
        ? {}
        : { specialInstructions: input.value.specialInstructions }),
      ...(context.policyText === '' ? {} : { exceptionPolicy: context.policyText }),
    };

    const budget = this.preparation.guardBudget(request);
    if (!budget.ok) {
      this.fail(budget.error);
      return;
    }

    this.stateSignal.set({ kind: 'writing' });
    this.announce('Writing Japanese…');
    const written = await this.provider.generateStory(request, context.taskConfig, signal);
    if (!written.ok) {
      this.finish(written.error, signal);
      return;
    }

    await this.runValidationLoop(
      written.value,
      request,
      context,
      prepared.value.suggestedItemIds,
      input.value.chosenPlot?.record,
      signal,
    );
  }

  cancel(): void {
    if (!this.canCancel()) {
      return;
    }
    this.controller?.abort();
  }

  /**
   * Resubmits the assembled draft after a `finalizing` failure.
   *
   * A storage failure is the one failure worth offering again unchanged: the
   * Japanese passed validation and the draft in `builtDraft` is exactly the
   * rows the transaction refused, so retrying spends nothing and asks the
   * provider for nothing. A no-op outside a retryable `finalizing` failure.
   */
  async retrySave(): Promise<void> {
    if (!this.canRetrySave() || this.builtDraft === null) {
      return;
    }
    const draft = this.builtDraft;
    await this.persist(draft);
  }

  /** Returns to the empty form, discarding a finished run. */
  reset(): void {
    this.controller?.abort();
    this.controller = null;
    this.builtDraft = null;
    this.repairSignal.set(0);
    this.reviewSignal.set(0);
    this.stateSignal.set(IDLE);
    this.announce('');
  }

  dispose(): void {
    this.controller?.abort();
    this.controller = null;
  }

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
   */
  private async runValidationLoop(
    firstCandidate: StoryCandidate,
    request: StoryGenerationRequest,
    context: CapturedContext,
    suggestedItemIds: readonly VocabularyItemId[],
    storyDirection: StoryDirectionRecord | undefined,
    signal: AbortSignal,
  ): Promise<void> {
    let candidate = firstCandidate;
    // Two memories that live exactly as long as this run. A word the policy has
    // already refused would get the same answer from the same policy text, so
    // asking again is a request the learner pays for twice; and the repair
    // service has to be told which surfaces earlier repairs already failed to
    // remove.
    const settledRejections = new Set<string>();
    const repairMemory = new RepairMemory();

    for (;;) {
      this.stateSignal.set({ kind: 'parsing' });
      const structureIssues = checkStoryStructure(candidate);

      this.stateSignal.set({ kind: 'validating' });
      this.announce('Checking every word against your vocabulary…');
      const analyzed = await this.analysis.analyze(candidate, context, signal);
      if (!analyzed.ok) {
        this.finish(analyzed.error, signal);
        return;
      }
      if (isAborted(signal)) {
        this.cancelled();
        return;
      }

      const units = analyzed.value;
      const candidates = this.storyRepair.collectCandidates(units);
      const unsettled = candidates.filter((candidate) => !settledRejections.has(candidate.id));

      let review: ExceptionReviewOutcome = noApprovals(unsettled);
      if (unsettled.length > 0 && context.policyText !== '') {
        this.stateSignal.set({ kind: 'exception-review', candidateCount: unsettled.length });
        this.reviewSignal.set(this.reviewSignal() + 1);
        this.announce(
          `Asking your exception policy about ${String(unsettled.length)} unfamiliar words…`,
        );
        const reviewed = await this.provider.reviewExceptions(
          {
            policyText: context.policyText,
            candidates: unsettled,
            promptVersion: PROMPT_VERSIONS['exception-review'],
          },
          context.taskConfig,
          signal,
        );
        if (reviewed.ok) {
          review = applyDecisions(unsettled, reviewed.value);
          for (const rejected of review.rejections) {
            settledRejections.add(rejected);
          }
        } else if (reviewed.error.code === 'cancelled' || isAborted(signal)) {
          this.cancelled();
          return;
        }
        // Any other review failure is not fatal: every candidate simply stays
        // unknown and goes to repair. Inferring approval from a failed request
        // is the one thing that must never happen here.
      }

      this.storyRepair.applyApprovals(units, review);
      // Words the policy already refused never reached this pass's review, so
      // they are added back here: skipping the request must not quietly turn a
      // refusal into an acceptance.
      const remaining = new Set([
        ...review.stillUnknown,
        ...candidates
          .filter((candidate) => settledRejections.has(candidate.id))
          .map((candidate) => candidate.id),
      ]);
      const budgetSpent = this.repairSignal() >= context.repairBudget;
      const outstanding = remaining.size > 0 || structureIssues.length > 0;

      if (!outstanding || budgetSpent) {
        this.storyRepair.markUnresolved(units, remaining);
        await this.finalize(
          units,
          request,
          context,
          suggestedItemIds,
          review.approvals.size,
          storyDirection,
          signal,
        );
        return;
      }

      const attempt = this.repairSignal() + 1;
      const unknownCount = remaining.size;
      const structureIssueCount = structureIssues.length;
      this.repairSignal.set(attempt);
      this.stateSignal.set({
        kind: 'repairing',
        attempt,
        totalAttempts: context.repairBudget,
        unknownCount,
        structureIssueCount,
      });
      this.announce(
        repairAnnouncement(unknownCount, structureIssueCount, attempt, context.repairBudget),
      );

      const repaired = await this.storyRepair.repair(
        {
          request,
          candidate,
          units,
          candidates,
          remaining,
          structureIssues,
          attempt,
          taskConfig: context.taskConfig,
          memory: repairMemory,
        },
        signal,
      );
      if (!repaired.ok) {
        this.finish(repaired.error, signal);
        return;
      }
      candidate = repaired.value;
    }
  }

  /**
   * Builds the accepted story and writes it and its evidence in one
   * transaction.
   *
   * Generation writes Japanese and stops. The aid layers the story declares are
   * queued by the preparation lane the moment the save lands (ADR 0047,
   * ADR 0048), so a story reaches the library as soon as its own text is valid
   * rather than after two batched provider stages nobody asked to wait for.
   */
  private async finalize(
    units: readonly AnalyzedUnit[],
    request: StoryGenerationRequest,
    context: CapturedContext,
    suggestedItemIds: readonly VocabularyItemId[],
    exceptionCount: number,
    storyDirection: StoryDirectionRecord | undefined,
    signal: AbortSignal,
  ): Promise<void> {
    const sentences: readonly AcceptedSentence[] = units
      .filter((unit) => unit.sentenceIndex !== null)
      .map((unit) => ({ textJa: unit.textJa, tokens: unit.tokens, statuses: unit.statuses }));

    const draft = this.assembly.build({
      titleJa: defined(units[0], 'title unit').textJa,
      sentences,
      form: request.form,
      premise: request.premise,
      snapshotId: context.snapshot.id,
      validatorVersion: VALIDATOR_VERSION,
      grammarProfileSnapshotId: context.profile.id,
      exceptionPolicyHash: context.policyHash,
      modelId: context.taskConfig.modelId,
      requestedSentenceCount: request.requestedSentenceCount,
      repairAttempts: this.repairSignal(),
      suggestedVocabularyItemIds: suggestedItemIds,
      ankiWordPriorityMode: context.ankiWordPriorityMode,
      ...(context.ankiWordPriorityMode === 'recent'
        ? {
            recentFocus: {
              size: context.recentFocusSize,
              words: request.focusVocabulary ?? [],
            },
          }
        : {}),
      vocabularyStrictness: context.vocabularyStrictness,
      exceptionCount,
      preparationTargets: context.preparationTargets,
      ...(storyDirection === undefined ? {} : { storyDirection }),
      ...(request.specialInstructions === undefined
        ? {}
        : { specialInstructions: request.specialInstructions }),
    });

    // The last place a cancellation can still be honoured: `persist` opens the
    // one transaction that either writes the whole story or writes nothing.
    if (isAborted(signal)) {
      this.cancelled();
      return;
    }

    await this.persist(draft);
  }

  /** Saves an assembled draft, the shared tail of `finalize` and `retrySave`. */
  private async persist(draft: GeneratedStoryDraft): Promise<void> {
    this.stateSignal.set({ kind: 'finalizing' });
    this.announce('Saving the story. This cannot be cancelled.');

    const saved = await this.assembly.save(draft);
    this.controller = null;
    if (!saved.ok) {
      this.builtDraft = draft;
      this.stateSignal.set({ kind: 'failed', error: saved.error, during: 'finalizing' });
      this.announce('The story could not be saved. Nothing was added to your library.');
      return;
    }

    this.builtDraft = null;
    this.stateSignal.set({ kind: 'saved', reading: saved.value });
    this.logger.info('job.succeeded', { kind: 'generation' });
    this.announce(`Saved “${saved.value.title}” to your library.`);
    // Last, because the owner may end this run and destroy this store in reply.
    this.onSaved?.(saved.value);
  }

  /** Structural baseline forms, which stay readable whatever the allowlist says. */
  private baselineForms(): readonly string[] {
    const forms = new Set<string>();
    for (const entry of this.language.structuralBaseline()) {
      for (const form of entry.forms) {
        forms.add(form);
      }
    }
    return [...forms];
  }

  /** A provider failure is a cancellation or a real failure, never both. */
  private finish(error: GenerationFailure, signal: AbortSignal): void {
    if (error.domain === 'ai' && error.code === 'cancelled') {
      this.cancelled();
      return;
    }
    if (isAborted(signal)) {
      this.cancelled();
      return;
    }
    this.fail(error);
  }

  private fail(error: GenerationFailure): void {
    const during = this.runningKind();
    this.controller = null;
    this.logger.error('job.failed', {
      kind: 'generation',
      errorDomain: error.domain,
      errorCode: error.code,
      phase: during,
    });
    this.stateSignal.set({ kind: 'failed', error, during });
    this.announce(error.message);
  }

  /** Where the run currently is, for a failure that has to say so. */
  private runningKind(): RunningStateKind {
    const kind = this.stateSignal().kind;
    switch (kind) {
      case 'checking-prerequisites':
      case 'preparing':
      case 'writing':
      case 'parsing':
      case 'validating':
      case 'exception-review':
      case 'repairing':
      case 'finalizing':
        return kind;
      default:
        // Only reachable if a failure is reported outside a run, which the
        // public methods do not do; naming the first stage is the honest guess.
        return 'checking-prerequisites';
    }
  }

  private cancelled(): void {
    const during = this.runningKind();
    this.controller = null;
    this.logger.info('job.cancelled', { kind: 'generation', phase: during });
    this.stateSignal.set({ kind: 'cancelled', during });
    this.announce('Generation cancelled. Nothing was saved.');
  }

  private announce(message: string): void {
    this.announcementSignal.set(message);
  }
}
