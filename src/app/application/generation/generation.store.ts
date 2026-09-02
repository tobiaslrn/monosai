import { Injectable, computed, inject, signal } from '@angular/core';
import { aiError, type AiError } from '../../domain/ai/ai-error';
import {
  applyDecisions,
  noApprovals,
  type ExceptionCandidate,
  type ExceptionReviewOutcome,
} from '../../domain/ai/exception-review';
import { MAX_REPAIR_ATTEMPTS } from '../../domain/ai/generation-provenance';
import { PROMPT_VERSIONS } from '../../domain/ai/prompt-versions';
import {
  storyFormForSentenceCount,
  validateStoryInput,
  type StoryCandidate,
  type StoryGenerationRequest,
  type StoryInputDraft,
} from '../../domain/ai/story-request';
import { checkStoryStructure, orderedSentences } from '../../domain/ai/story-structure';
import type { TextTaskConfig, UnknownSpan } from '../../domain/ai/text-generation-provider';
import type { GrammarProfileSnapshot } from '../../domain/grammar/profile';
import { VALIDATOR_VERSION } from '../../domain/language/analyzer-version';
import type { LanguageError } from '../../domain/language/language-error';
import type { SentenceTokens } from '../../domain/language/language-runtime';
import type { GeneratedStory } from '../../domain/reading/reading';
import type { GeneratedStoryDraft } from '../../domain/reading/reading-repository';
import type { Token } from '../../domain/reading/token';
import type { TokenStatusAssignment } from '../../domain/reading/validation';
import type { VocabularyItemId } from '../../domain/shared/ids';
import type { StorageError } from '../../domain/storage/storage-error';
import type { VocabularySnapshot } from '../../domain/vocabulary/snapshot';
import type { AnkiWordPriorityMode } from '../../domain/settings/settings';
import { EnrichmentKeysService } from '../enrichment/enrichment-keys.service';
import { GrammarAnalysisService } from '../enrichment/grammar-analysis.service';
import { TranslationService } from '../enrichment/translation.service';
import { GrammarProfileStore } from '../grammar/grammar-profile.store';
import { LanguageStore } from '../language/language.store';
import { VocabularyClassificationService } from '../reading/vocabulary-classification.service';
import { ExceptionPolicyStore } from '../settings/exception-policy.store';
import { AppSettingsStore } from '../settings/app-settings.store';
import { TextModelStore } from '../settings/text-model.store';
import { TEXT_GENERATION_PROVIDER } from '../shared/ai-tokens';
import { LANGUAGE_RUNTIME } from '../shared/language-tokens';
import { VOCABULARY_REPOSITORY } from '../shared/repository-tokens';
import { StoryAssemblyService, type AcceptedSentence } from './story-assembly.service';
import { VocabularyPreparationService } from './vocabulary-preparation.service';
import { LOGGER, NOOP_LOGGER, type Logger } from '../shared/diagnostics';

export type GenerationFailure = AiError | LanguageError | StorageError;

/**
 * The generation state machine from ai-pipelines section 5.
 *
 * The ordering carries the guarantee: everything up to `finalizing` is
 * discardable, so a cancellation or a failure at any of those states leaves no
 * reading row, and `finalizing` is the one non-cancellable state because it is
 * a single transaction that either writes the whole story or writes nothing.
 */
export type GenerationState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'checking-prerequisites' }
  | { readonly kind: 'preparing' }
  | { readonly kind: 'writing' }
  | { readonly kind: 'parsing' }
  | { readonly kind: 'validating' }
  | { readonly kind: 'exception-review'; readonly candidateCount: number }
  | {
      readonly kind: 'repairing';
      readonly attempt: number;
      readonly unknownCount: number;
      readonly structureIssueCount: number;
    }
  | {
      readonly kind: 'auxiliary-review';
      readonly grammar: BranchState;
      readonly translation: BranchState;
    }
  | { readonly kind: 'finalizing' }
  | { readonly kind: 'saved'; readonly reading: GeneratedStory }
  | {
      readonly kind: 'cancelled';
      /** The stage the run was in when it was cancelled. */
      readonly during: RunningStateKind;
    }
  | {
      readonly kind: 'failed';
      readonly error: GenerationFailure;
      /**
       * The stage the run was in when it failed.
       *
       * A terminal state names no stage of its own, and the progress display
       * has to say where the run stopped rather than painting everything as
       * never started.
       */
      readonly during: RunningStateKind;
    };

/**
 * One auxiliary branch's progress, independent of the other's.
 *
 * `unavailable` is kept apart from `partial` because they mean different
 * things to the learner: a review that did not happen is not the same as a
 * translation that covered some of the story, and collapsing them would make
 * "grammar was not reviewed" read as "grammar found nothing".
 */
export type BranchState =
  | { readonly status: 'running' }
  | { readonly status: 'complete' }
  | { readonly status: 'partial'; readonly completed: number; readonly total: number }
  | { readonly status: 'unavailable' };

/** How both auxiliary branches ended, once they have. */
export interface AuxiliaryOutcome {
  readonly grammar: BranchState;
  readonly translation: BranchState;
}

/** The states a run passes through, as opposed to the ones it ends in. */
export type RunningStateKind =
  | 'checking-prerequisites'
  | 'preparing'
  | 'writing'
  | 'parsing'
  | 'validating'
  | 'exception-review'
  | 'repairing'
  | 'auxiliary-review'
  | 'finalizing';

const IDLE: GenerationState = { kind: 'idle' };

/** States where a cancel request is still meaningful. */
const CANCELLABLE = new Set<GenerationState['kind']>([
  'checking-prerequisites',
  'preparing',
  'writing',
  'parsing',
  'validating',
  'exception-review',
  'repairing',
  'auxiliary-review',
]);

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

/** The context captured before the first request and never re-read after it. */
interface CapturedContext {
  readonly snapshot: VocabularySnapshot;
  readonly profile: GrammarProfileSnapshot;
  readonly policyText: string;
  readonly policyHash: string;
  readonly taskConfig: TextTaskConfig;
  readonly grammarTaskConfig: TextTaskConfig;
  readonly translationTaskConfig: TextTaskConfig;
  readonly ankiWordPriorityMode: AnkiWordPriorityMode;
}

/** Title and sentences carry the same analysis; only the title has no row. */
interface AnalyzedUnit {
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
function candidateKey(token: Token): string {
  return `${token.surface}|${token.lemma ?? ''}`;
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
  private readonly runtime = inject(LANGUAGE_RUNTIME);
  private readonly vocabulary = inject(VOCABULARY_REPOSITORY);
  private readonly preparation = inject(VocabularyPreparationService);
  private readonly assembly = inject(StoryAssemblyService);
  private readonly classification = inject(VocabularyClassificationService);
  private readonly grammar = inject(GrammarProfileStore);
  private readonly policy = inject(ExceptionPolicyStore);
  private readonly appSettings = inject(AppSettingsStore);
  private readonly textModel = inject(TextModelStore);
  private readonly language = inject(LanguageStore);
  private readonly enrichmentKeys = inject(EnrichmentKeysService);
  private readonly translationService = inject(TranslationService);
  private readonly grammarAnalysisService = inject(GrammarAnalysisService);
  private readonly logger = inject<Logger>(LOGGER, { optional: true }) ?? NOOP_LOGGER;

  private readonly stateSignal = signal<GenerationState>(IDLE);
  private readonly announcementSignal = signal('');
  private readonly repairSignal = signal(0);
  private readonly reviewSignal = signal(0);
  private readonly auxiliarySignal = signal<AuxiliaryOutcome | null>(null);

  private controller: AbortController | null = null;
  /**
   * The draft as it stood after the last auxiliary merge, kept in memory so a
   * `finalizing` failure can be retried without calling the provider again.
   * Cleared once it is safely saved.
   */
  private builtDraft: GeneratedStoryDraft | null = null;

  readonly state = this.stateSignal.asReadonly();
  readonly announcement = this.announcementSignal.asReadonly();
  /** Content repairs spent so far in this run. Format recovery is not counted. */
  readonly repairAttempts = this.repairSignal.asReadonly();
  /** Exception reviews run so far, so the stepper can say Skipped honestly. */
  readonly exceptionReviews = this.reviewSignal.asReadonly();
  /**
   * How the auxiliary branches ended, or null before they have.
   *
   * Held apart from `state` because the run moves on to `finalizing` and
   * `saved` while the outcome stays worth showing: the progress display and the
   * saved panel both have to keep reporting a partial translation after the
   * story is in the library.
   */
  readonly auxiliary = this.auxiliarySignal.asReadonly();

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

    this.logger.info('job.started', { kind: 'generation', count: sentenceCount });

    this.repairSignal.set(0);
    this.reviewSignal.set(0);
    this.auxiliarySignal.set(null);
    this.stateSignal.set({ kind: 'checking-prerequisites' });
    this.announce('Checking what this story needs…');

    const captured = await this.capture(modelPresetId, capturedPriorityMode);
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
      allowedVocabulary: prepared.value.allowedVocabulary,
      suggestedVocabulary: prepared.value.suggestedVocabulary,
      structuralBaseline: this.baselineForms(),
      grammarGuidance: context.profile.resolvedGuidance,
      registerPreference: context.profile.registerPreference,
      snapshotId: context.snapshot.id,
      grammarProfileHash: context.profile.profileHash,
      promptVersion: PROMPT_VERSIONS.story,
      ...(input.value.specialInstructions === undefined
        ? {}
        : { specialInstructions: input.value.specialInstructions }),
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
   * Resubmits the already-merged draft after a `finalizing` failure.
   *
   * Spends zero additional provider calls: grammar and translation already
   * ran, and their results are kept in `builtDraft` exactly as they were
   * merged. A no-op outside a retryable `finalizing` failure.
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
    this.auxiliarySignal.set(null);
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
    signal: AbortSignal,
  ): Promise<void> {
    let candidate = firstCandidate;
    // Two memories that live exactly as long as this run. A word the policy has
    // already refused would get the same answer from the same policy text, so
    // asking again is a request the learner pays for twice; and a surface that
    // survived a repair has to be named as such, or nothing stops the next
    // repair reaching for the same replacement.
    const settledRejections = new Set<string>();
    const attemptedSurfaces = new Set<string>();

    for (;;) {
      this.stateSignal.set({ kind: 'parsing' });
      const structureIssues = checkStoryStructure(candidate);

      this.stateSignal.set({ kind: 'validating' });
      this.announce('Checking every word against your vocabulary…');
      const analyzed = await this.analyze(candidate, context, signal);
      if (!analyzed.ok) {
        this.finish(analyzed.error, signal);
        return;
      }
      if (isAborted(signal)) {
        this.cancelled();
        return;
      }

      const units = analyzed.value;
      const candidates = this.collectCandidates(units);
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

      this.applyApprovals(units, review);
      // Words the policy already refused never reached this pass's review, so
      // they are added back here: skipping the request must not quietly turn a
      // refusal into an acceptance.
      const remaining = new Set([
        ...review.stillUnknown,
        ...candidates
          .filter((candidate) => settledRejections.has(candidate.id))
          .map((candidate) => candidate.id),
      ]);
      const budgetSpent = this.repairSignal() >= MAX_REPAIR_ATTEMPTS;
      const outstanding = remaining.size > 0 || structureIssues.length > 0;

      if (!outstanding || budgetSpent) {
        this.markUnresolved(units, remaining);
        await this.finalize(
          units,
          request,
          context,
          suggestedItemIds,
          review.approvals.size,
          signal,
        );
        return;
      }

      const attempt = this.repairSignal() + 1;
      const unknownCount = remaining.size;
      const structureIssueCount = structureIssues.length;
      this.repairSignal.set(attempt);
      this.stateSignal.set({ kind: 'repairing', attempt, unknownCount, structureIssueCount });
      const repairWork =
        unknownCount > 0
          ? `Replacing ${String(unknownCount)} unfamiliar ${unknownCount === 1 ? 'word' : 'words'}${structureIssueCount > 0 ? ' and fixing the story structure' : ''}`
          : 'Fixing the story structure';
      this.announce(
        `${repairWork} (attempt ${String(attempt)} of ${String(MAX_REPAIR_ATTEMPTS)})…`,
      );

      const spans = this.unknownSpans(units, candidates, remaining);
      const previouslyAttempted = [
        ...new Set(
          spans.map((span) => span.surface).filter((surface) => attemptedSurfaces.has(surface)),
        ),
      ];
      for (const span of spans) {
        attemptedSurfaces.add(span.surface);
      }

      const repaired = await this.provider.repairStory(
        {
          original: request,
          candidate,
          unknownSpans: spans,
          structureIssues,
          attempt,
          previouslyAttempted,
          promptVersion: PROMPT_VERSIONS.repair,
        },
        context.taskConfig,
        signal,
      );
      if (!repaired.ok) {
        this.finish(repaired.error, signal);
        return;
      }
      candidate = repaired.value;
    }
  }

  /** Captures the snapshot, profile, policy, and model before anything is spent. */
  private async capture(
    modelPresetId: string | null,
    ankiWordPriorityMode: AnkiWordPriorityMode,
  ): Promise<
    | { readonly ok: true; readonly value: CapturedContext }
    | { readonly ok: false; readonly error: GenerationFailure }
  > {
    const snapshot = await this.vocabulary.getActiveSnapshot();
    if (!snapshot.ok) {
      return { ok: false, error: snapshot.error };
    }
    if (snapshot.value === null) {
      return {
        ok: false,
        error: aiError('unknown', 'story-generation', 'There is no active vocabulary snapshot.', {
          detail: { issueCode: 'no-snapshot' },
        }),
      };
    }

    const profile = await this.grammar.captureProfile();
    if (!profile.ok) {
      return { ok: false, error: profile.error };
    }

    const settings = this.textModel.settings();
    const configurable = this.textModel as Partial<Pick<TextModelStore, 'configForPreset'>>;
    const selected =
      modelPresetId === null
        ? (configurable.configForPreset?.(settings.activePresetId) ??
          (settings.modelId !== '' && settings.structuredOutput !== null
            ? {
                modelId: settings.modelId,
                reasoningEffort: settings.reasoningEffort,
                structuredOutput: settings.structuredOutput,
                storyTokenBudget: settings.storyTokenBudget,
              }
            : null))
        : (configurable.configForPreset?.(modelPresetId) ?? null);
    if (selected === null) {
      return {
        ok: false,
        error: aiError(
          'capability-unsupported',
          'story-generation',
          'No tested text model is available for generation.',
          { detail: { capability: 'structured-output' } },
        ),
      };
    }

    const policy = this.policy.policy();
    return {
      ok: true,
      value: {
        snapshot: snapshot.value,
        profile: profile.value,
        policyText: policy.text,
        policyHash: policy.policyHash,
        taskConfig: selected,
        grammarTaskConfig:
          configurable.configForPreset?.(settings.grammarPresetId ?? null) ?? selected,
        translationTaskConfig:
          configurable.configForPreset?.(settings.translationPresetId ?? null) ?? selected,
        ankiWordPriorityMode,
      },
    };
  }

  /** Tokenizes the title and every sentence, then classifies them together. */
  private async analyze(
    candidate: StoryCandidate,
    context: CapturedContext,
    signal: AbortSignal,
  ): Promise<
    | { readonly ok: true; readonly value: AnalyzedUnit[] }
    | { readonly ok: false; readonly error: GenerationFailure }
  > {
    const sentences = orderedSentences(candidate);
    const texts = [candidate.titleJa, ...sentences];

    const tokenized = await this.runtime.analyzeSentences(texts, signal);
    if (!tokenized.ok) {
      return { ok: false, error: tokenized.error };
    }
    if (tokenized.value.length !== texts.length) {
      return {
        ok: false,
        error: aiError(
          'unknown',
          'story-generation',
          'The analysis returned the wrong number of sentences.',
          {
            detail: { issueCode: 'analysis-length-mismatch' },
          },
        ),
      };
    }

    const units: AnalyzedUnit[] = texts.map((textJa, index) => ({
      key: index === 0 ? 'title' : `s${String(index - 1)}`,
      sentenceIndex: index === 0 ? null : index - 1,
      textJa,
      tokens: tokenized.value[index].tokens,
      statuses: [],
    }));

    const input: readonly SentenceTokens[] = units.map((unit) => ({
      sentenceId: unit.key,
      tokens: unit.tokens,
    }));
    const classified = await this.classification.classifyGenerated(
      context.snapshot.id,
      input,
      signal,
    );
    if (!classified.ok) {
      return { ok: false, error: classified.error };
    }

    const byKey = new Map(
      classified.value.sentences.map((sentence) => [sentence.sentenceId, sentence.statuses]),
    );
    for (const unit of units) {
      unit.statuses = byKey.get(unit.key) ?? [];
    }
    return { ok: true, value: units };
  }

  /**
   * One candidate per distinct word, not per occurrence.
   *
   * The policy is asked about a word, and asking twice would let the same word
   * be approved in one sentence and refused in the next.
   */
  private collectCandidates(units: readonly AnalyzedUnit[]): readonly ExceptionCandidate[] {
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
  private applyApprovals(units: AnalyzedUnit[], review: ExceptionReviewOutcome): void {
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
  private markUnresolved(units: AnalyzedUnit[], remaining: ReadonlySet<string>): void {
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

  /**
   * Builds the accepted story, runs grammar review and translation
   * concurrently against it, and writes the result and its evidence in one
   * transaction.
   */
  private async finalize(
    units: readonly AnalyzedUnit[],
    request: StoryGenerationRequest,
    context: CapturedContext,
    suggestedItemIds: readonly VocabularyItemId[],
    exceptionCount: number,
    signal: AbortSignal,
  ): Promise<void> {
    const sentences: readonly AcceptedSentence[] = units
      .filter((unit) => unit.sentenceIndex !== null)
      .map((unit) => ({ textJa: unit.textJa, tokens: unit.tokens, statuses: unit.statuses }));

    const draft = this.assembly.build({
      titleJa: units[0].textJa,
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
      exceptionCount,
      ...(request.specialInstructions === undefined
        ? {}
        : { specialInstructions: request.specialInstructions }),
    });

    this.stateSignal.set({
      kind: 'auxiliary-review',
      grammar: { status: 'running' },
      translation: { status: 'running' },
    });
    this.announce('Reviewing grammar and translating…');

    const modelId = context.translationTaskConfig.modelId;
    const grammarModelId = context.grammarTaskConfig.modelId;
    const translationKeys = this.enrichmentKeys.translationKeys(
      draft.sentences,
      modelId,
      PROMPT_VERSIONS.translation,
    );
    const grammarKeys = this.enrichmentKeys.grammarKeys(
      draft.sentences,
      grammarModelId,
      PROMPT_VERSIONS.grammar,
      context.profile.profileHash,
    );

    const [grammarOutcome, translationOutcome] = await Promise.all([
      this.grammarAnalysisService.run(
        draft.sentences,
        draft.reading.id,
        grammarKeys,
        context.profile.profileHash,
        context.profile.resolvedGuidance,
        context.profile.registerPreference,
        grammarModelId,
        PROMPT_VERSIONS.grammar,
        context.grammarTaskConfig,
        signal,
      ),
      this.translationService.run(
        draft.sentences,
        draft.reading.id,
        translationKeys,
        modelId,
        PROMPT_VERSIONS.translation,
        context.translationTaskConfig,
        signal,
        // The generated path is the one place that knows both: the story was
        // written to this register, and the title is its own subject matter.
        {
          titleJa: draft.reading.title,
          registerPreference: context.profile.registerPreference,
          premiseJa: request.premise,
          consistencyTermsJa: [
            ...new Set(
              units.flatMap((unit) =>
                unit.tokens
                  .filter((token) => token.partOfSpeech === 'proper-noun')
                  .map((token) => token.surface),
              ),
            ),
          ],
        },
      ),
    ]);

    if (isAborted(signal)) {
      this.cancelled();
      return;
    }

    const outcome: AuxiliaryOutcome = {
      grammar:
        grammarOutcome.status === 'unavailable'
          ? { status: 'unavailable' }
          : { status: 'complete' },
      translation:
        translationOutcome.failures.length === 0
          ? { status: 'complete' }
          : {
              status: 'partial',
              completed: translationOutcome.records.length,
              total: draft.sentences.length,
            },
    };
    this.auxiliarySignal.set(outcome);
    this.stateSignal.set({
      kind: 'auxiliary-review',
      grammar: outcome.grammar,
      translation: outcome.translation,
    });

    const merged = this.assembly.withAuxiliary(draft, grammarOutcome, translationOutcome);
    await this.persist(merged);
  }

  /** Saves a fully merged draft, the shared tail of `finalize` and `retrySave`. */
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
      case 'auxiliary-review':
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
