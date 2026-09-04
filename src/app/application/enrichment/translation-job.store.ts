import { Injectable, computed, inject, signal } from '@angular/core';
import { aiError, isAutomaticallyRetryable, type AiError } from '../../domain/ai/ai-error';
import { PROMPT_VERSIONS } from '../../domain/ai/prompt-versions';
import type { TextTaskConfig } from '../../domain/ai/text-generation-provider';
import { MAX_TRANSLATION_BATCH, planBatches } from '../../domain/ai/translation-request';
import { translationConfigFingerprint } from '../../domain/enrichment/cache-keys';
import { remainingSentenceIds, type AssetJob, type JobState } from '../../domain/enrichment/jobs';
import type { SentenceRef } from '../../domain/reading/reading-repository';
import type { TokenAnalysis } from '../../domain/reading/token';
import { jobId, type ReadingId, type SentenceId } from '../../domain/shared/ids';
import type { Result } from '../../domain/shared/result';
import type { StorageError } from '../../domain/storage/storage-error';
import {
  CLOCK,
  HASHER,
  ID_GENERATOR,
  JOB_REPOSITORY,
  READING_REPOSITORY,
} from '../shared/repository-tokens';
import { GrammarProfileStore } from '../grammar/grammar-profile.store';
import { TextModelStore } from '../settings/text-model.store';
import { EnrichmentKeysService } from './enrichment-keys.service';
import { TranslationService, type TranslationContext } from './translation.service';
import { LOGGER, NOOP_LOGGER, type Logger } from '../shared/diagnostics';
import { NOTHING_TO_DO, QUEUED, type EnqueueOutcome, type LayerError } from './layer-progress';

/** Which layer refused, so the reader's panel can offer the right next action. */
export type TranslationJobError =
  | { readonly source: 'provider'; readonly error: AiError }
  | { readonly source: 'storage'; readonly error: StorageError };

export interface TranslationJobCounts {
  /** Sentences in the reading, translated or not. */
  readonly total: number;
  /** Sentences this job set out to translate — the ones missing a current row. */
  readonly requested: number;
  readonly completed: number;
  readonly failed: number;
}

export type TranslationJobProgress =
  | { readonly kind: 'idle' }
  | { readonly kind: 'preparing'; readonly readingId: ReadingId }
  | {
      readonly kind: 'running';
      readonly readingId: ReadingId;
      readonly counts: TranslationJobCounts;
    }
  | {
      readonly kind: 'complete';
      readonly readingId: ReadingId;
      readonly counts: TranslationJobCounts;
    }
  | {
      readonly kind: 'cancelled';
      readonly readingId: ReadingId;
      readonly counts: TranslationJobCounts;
    }
  | {
      readonly kind: 'paused';
      readonly readingId: ReadingId;
      readonly counts: TranslationJobCounts;
    }
  | { readonly kind: 'deleted'; readonly readingId: ReadingId }
  | {
      readonly kind: 'failed';
      readonly readingId: ReadingId;
      readonly counts: TranslationJobCounts;
      readonly error: TranslationJobError;
    };

const IDLE: TranslationJobProgress = { kind: 'idle' };

/** Reads the flag through a call, so an earlier check never narrows a later one. */
function isAborted(signal: AbortSignal): boolean {
  return signal.aborted;
}

/**
 * Which sentences a newly created job covers.
 *
 * `current-configuration` is what *Translate reading* asks: everything without
 * a row under today's model and prompt. `never-prepared` is what the lane
 * queues: everything with no stored translation at all, so changing the model
 * queues nothing.
 */
type JobScope = 'current-configuration' | 'never-prepared';

type PlanOutcome =
  | { readonly kind: 'planned'; readonly context: JobContext; readonly job: AssetJob }
  | { readonly kind: 'nothing-to-do'; readonly context: JobContext }
  | { readonly kind: 'unavailable'; readonly outcome: UnavailableOutcome };

type UnavailableOutcome = Extract<EnqueueOutcome, { kind: 'unavailable' }>;

function unavailable(error: LayerError): PlanOutcome {
  return { kind: 'unavailable', outcome: { kind: 'unavailable', error } };
}

/** Everything one run needs, captured once so no setting can change mid-flight. */
interface JobContext {
  readonly readingId: ReadingId;
  readonly modelId: string;
  readonly taskConfig: TextTaskConfig;
  readonly cacheKeys: ReadonlyMap<SentenceId, string>;
  readonly fingerprint: string;
  readonly total: number;
  /** Every sentence of the reading, in order — the basis for its translation context. */
  readonly refs: readonly SentenceRef[];
}

/**
 * The whole-reading translation job.
 *
 * Headless on purpose: everything here is signals and awaited calls, so the
 * sequencing rules that matter — bounded batches processed one at a time, every
 * success stored before the next request is made, nothing scheduled after
 * cancellation — are unit-testable without a reader on screen. Milestone 8B
 * adds the panel that renders `progress`.
 *
 * The job performs **no retries of its own**. `OpenRouterClient` already spends
 * up to two capped-backoff transport retries per request; a job that retried a
 * failed batch on top of that would silently multiply the specification's retry
 * budget. Instead the failure is recorded, scheduling stops, and `retry` starts
 * a fresh bounded attempt over whatever is still missing.
 */
@Injectable({ providedIn: 'root' })
export class TranslationJobStore {
  private readonly readings = inject(READING_REPOSITORY);
  private readonly jobs = inject(JOB_REPOSITORY);
  private readonly translation = inject(TranslationService);
  private readonly keys = inject(EnrichmentKeysService);
  private readonly textModel = inject(TextModelStore);
  private readonly grammarProfile = inject(GrammarProfileStore);
  private readonly hasher = inject(HASHER);
  private readonly clock = inject(CLOCK);
  private readonly ids = inject(ID_GENERATOR);
  private readonly logger = inject<Logger>(LOGGER, { optional: true }) ?? NOOP_LOGGER;

  private readonly progressSignal = signal<TranslationJobProgress>(IDLE);
  private controller: AbortController | null = null;
  private yieldRequested = false;
  /** The full prepare/process lifetime, so deletion can join it before removing rows. */
  private activeRun: Promise<void> | null = null;

  readonly progress = this.progressSignal.asReadonly();

  readonly isRunning = computed(() => {
    const kind = this.progressSignal().kind;
    return kind === 'preparing' || kind === 'running';
  });

  progressFor(readingId: ReadingId): TranslationJobProgress {
    const progress = this.progressSignal();
    return progress.kind !== 'idle' && progress.readingId === readingId ? progress : IDLE;
  }

  isRunningFor(readingId: ReadingId): boolean {
    const kind = this.progressFor(readingId).kind;
    return kind === 'preparing' || kind === 'running';
  }

  /**
   * Queues this reading without issuing a single request.
   *
   * The row covers the sentences that have never been translated under any
   * configuration, which is what makes a model change free: work is what has
   * never been produced, not what is out of date under today's settings.
   */
  async enqueue(readingId: ReadingId): Promise<EnqueueOutcome> {
    const prepared = await this.plan(readingId, 'never-prepared', 'queued');
    if (prepared.kind !== 'planned') {
      return prepared.kind === 'nothing-to-do' ? NOTHING_TO_DO : prepared.outcome;
    }
    return remainingSentenceIds(prepared.job).length === 0 ? NOTHING_TO_DO : QUEUED;
  }

  /**
   * Asks this run to stop at the next batch boundary and stay resumable.
   *
   * Not a cancellation, and deliberately not spelled as one. Nothing is stored
   * until a batch returns, so aborting mid-batch throws away a request that has
   * already been paid for, and a run reported as cancelled means something
   * final to every screen watching it.
   */
  yieldAfterBatch(): void {
    if (this.isRunning()) {
      this.yieldRequested = true;
    }
  }

  /**
   * Translates everything in the reading that is missing a translation under
   * the current model and prompt.
   *
   * Reuses an active job whose configuration still matches, so pressing the
   * action twice continues one job rather than racing two.
   */
  async start(readingId: ReadingId): Promise<void> {
    const activeRun = this.activeRun;
    if (activeRun !== null) {
      await activeRun;
      return;
    }
    const run = this.run(readingId);
    this.activeRun = run;
    try {
      await run;
    } finally {
      if (this.activeRun === run) {
        this.activeRun = null;
      }
    }
  }

  private async run(readingId: ReadingId): Promise<void> {
    // The controller exists before the first await so that cancelling while
    // configuration is still being read stops the run rather than being ignored.
    const controller = new AbortController();
    this.controller = controller;
    this.yieldRequested = false;
    this.logger.info('job.started', { kind: 'translation' });
    this.progressSignal.set({ kind: 'preparing', readingId });

    const prepared = await this.plan(readingId, 'current-configuration', 'running');
    if (prepared.kind === 'unavailable') {
      this.report(readingId, prepared.outcome.error);
      return;
    }
    if (prepared.kind === 'nothing-to-do') {
      this.controller = null;
      this.progressSignal.set({
        kind: 'complete',
        readingId,
        counts: { total: prepared.context.total, requested: 0, completed: 0, failed: 0 },
      });
      return;
    }
    await this.process(prepared.context, prepared.job, controller.signal);
  }

  /**
   * Continues an interrupted job after a reload. Does nothing when the reading
   * has no unfinished job, so opening a reader never issues a request.
   */
  async resume(readingId: ReadingId): Promise<void> {
    if (this.isRunning()) {
      return;
    }
    const existing = await this.jobs.findActive(readingId, 'translate-reading');
    if (!existing.ok) {
      this.failStorage(readingId, existing.error, emptyCounts());
      return;
    }
    if (existing.value === null) {
      if (this.progressFor(readingId).kind !== 'idle') {
        this.progressSignal.set(IDLE);
      }
      return;
    }
    await this.start(readingId);
  }

  /** Starts a fresh bounded attempt over whatever is still missing. */
  retry(readingId: ReadingId): Promise<void> {
    return this.start(readingId);
  }

  /**
   * Stops scheduling further batches.
   *
   * Work already stored stays stored: a translation is an aid whose value does
   * not depend on the rest of the reading, and discarding results the learner
   * already paid for would be a worse answer to "stop" than keeping them.
   */
  cancel(readingId: ReadingId): void {
    if (!this.owns(readingId)) {
      return;
    }
    this.controller?.abort();
    this.controller = null;
    // The run reports cancellation only after the job row is committed. A
    // learner reloading after seeing "Stopped" must not resume a running row.
  }

  /** Cancels this reading's run and waits until no in-flight result can still be stored. */
  async cancelAndWait(readingId: ReadingId): Promise<void> {
    this.cancel(readingId);
    await this.activeRun;
  }

  /** Finalizes a reading's run before its persisted rows are removed. */
  async readingDeleted(readingId: ReadingId): Promise<void> {
    if (!this.owns(readingId)) {
      return;
    }
    await this.cancelAndWait(readingId);
    this.progressSignal.set({ kind: 'deleted', readingId });
  }

  /**
   * Returns a settled job to rest, so its report leaves the reader.
   *
   * Only ever called for a run that has finished, been stopped, or failed:
   * dismissing the report of a run that is still scheduling batches would hide
   * work that is still spending requests.
   */
  acknowledge(readingId: ReadingId): void {
    if (this.owns(readingId) && !this.isRunningFor(readingId)) {
      this.progressSignal.set(IDLE);
    }
  }

  private owns(readingId: ReadingId): boolean {
    const progress = this.progressSignal();
    return progress.kind !== 'idle' && progress.readingId === readingId;
  }

  /**
   * Resolves configuration, keys, and the job row this run will advance.
   *
   * A stored job whose `configFingerprint` no longer matches is closed rather
   * than resumed: its remaining items were chosen against a model that is no
   * longer configured, and continuing it would report two configurations'
   * output under one progress number.
   *
   * `scope` chooses what a *new* row covers. It has no bearing on an existing
   * one, whose sentence list was settled when it was created.
   */
  private async plan(
    readingId: ReadingId,
    scope: JobScope,
    initialState: JobState,
  ): Promise<PlanOutcome> {
    const settings = this.textModel.settings();
    const structuredOutput = settings.structuredOutput;
    if (settings.modelId === '' || structuredOutput === null) {
      return unavailable({
        source: 'provider',
        error: aiError(
          'capability-unsupported',
          'translation',
          'No tested text model is available for translation.',
          { detail: { capability: 'structured-output' } },
        ),
      });
    }

    const refs = await this.readings.listSentenceRefs(readingId);
    if (!refs.ok) {
      return unavailable({ source: 'storage', error: refs.error });
    }

    const context: JobContext = {
      readingId,
      modelId: settings.modelId,
      taskConfig: {
        modelId: settings.modelId,
        structuredOutput,
        reasoningEffort: settings.reasoningEffort,
      },
      cacheKeys: this.keys.translationKeys(
        refs.value,
        settings.modelId,
        PROMPT_VERSIONS.translation,
      ),
      fingerprint: translationConfigFingerprint(
        this.hasher,
        settings.modelId,
        PROMPT_VERSIONS.translation,
      ),
      total: refs.value.length,
      refs: refs.value,
    };

    const active = await this.jobs.findActive(readingId, 'translate-reading');
    if (!active.ok) {
      return unavailable({ source: 'storage', error: active.error });
    }

    if (active.value !== null && active.value.configFingerprint === context.fingerprint) {
      const reconciled = await this.reconcile(context, active.value);
      return reconciled.ok
        ? { kind: 'planned', context, job: reconciled.value }
        : unavailable({ source: 'storage', error: reconciled.error });
    }

    if (active.value !== null) {
      const closed = await this.jobs.setState(active.value.id, 'cancelled');
      if (!closed.ok) {
        return unavailable({ source: 'storage', error: closed.error });
      }
    }

    const wanted =
      scope === 'never-prepared'
        ? await this.translation.neverPreparedSentenceIds(context.cacheKeys)
        : await this.missingSentenceIds(context);
    if (!wanted.ok) {
      return unavailable({ source: 'storage', error: wanted.error });
    }
    // No row is written for a reading with nothing outstanding. An empty job
    // could never complete itself, and the lane would pick it up forever.
    if (wanted.value.length === 0) {
      return { kind: 'nothing-to-do', context };
    }

    const created = await this.createJob(context, wanted.value, initialState);
    return created.ok
      ? { kind: 'planned', context, job: created.value }
      : unavailable({ source: 'storage', error: created.error });
  }

  /**
   * What this reading is, beyond the sentences themselves.
   *
   * The prompt asks for tone, register, and terminology to be held steady, and
   * it can only do that if something says what they are. Generation used to
   * assemble this inline from the story it had just written; the same facts are
   * on disk afterwards, so the job assembles them from storage instead.
   *
   * Every part is optional and every lookup degrades rather than failing. An
   * imported reading has no premise at all, and a reading whose title or tokens
   * cannot be read is still worth translating without them: a missing hint
   * costs a little consistency, and refusing the run would cost the aid.
   *
   * The names are what `TranslationService` turns into established renderings,
   * and `process` carries those forward from batch to batch so a name is
   * rendered the same way in the tenth sentence and the twentieth.
   */
  private async readingContext(context: JobContext): Promise<TranslationContext> {
    const { readingId, refs } = context;
    // The lane runs from anywhere, including a session that has never opened
    // the grammar screen, so the stored selection is read before it is asked
    // for its register rather than defaulting silently.
    if (!this.grammarProfile.loaded()) {
      await this.grammarProfile.load();
    }
    const registerPreference = this.grammarProfile.selection().registerPreference;

    const reading = await this.readings.getReading(readingId);
    const story = reading.ok && reading.value?.kind === 'generated' ? reading.value : null;

    const analyses = await this.readings.loadTokenAnalyses(refs.map((ref) => ref.id));
    const consistencyTermsJa = analyses.ok ? properNouns(refs, analyses.value) : [];

    return {
      registerPreference,
      ...(story === null ? {} : { titleJa: story.title, premiseJa: story.premise }),
      ...(consistencyTermsJa.length === 0 ? {} : { consistencyTermsJa }),
    };
  }

  /** Re-derives completion from stored rows, so a reload never over-reports. */
  private async reconcile(
    context: JobContext,
    job: AssetJob,
  ): Promise<Result<AssetJob, StorageError>> {
    const missing = await this.missingSentenceIds(context);
    if (!missing.ok) {
      return missing;
    }
    const outstanding = new Set(missing.value);
    const completed = job.orderedSentenceIds.filter((id) => !outstanding.has(id));
    return this.jobs.reconcile(job.id, completed);
  }

  private createJob(
    context: JobContext,
    orderedSentenceIds: readonly SentenceId[],
    state: JobState,
  ): Promise<Result<AssetJob, StorageError>> {
    const now = this.clock.now();
    return this.jobs.create({
      id: jobId(this.ids.nextId()),
      kind: 'translate-reading',
      readingId: context.readingId,
      state,
      orderedSentenceIds,
      completedSentenceIds: [],
      failedItems: [],
      configFingerprint: context.fingerprint,
      createdAt: now,
      updatedAt: now,
    });
  }

  private missingSentenceIds(
    context: JobContext,
  ): Promise<Result<readonly SentenceId[], StorageError>> {
    return this.translation.missingSentenceIds(context.readingId, context.cacheKeys);
  }

  /**
   * Processes the job's outstanding sentences in sequential bounded batches.
   *
   * One request is in flight at a time and each answer is stored and committed
   * before the next request is made, so an interruption between batches leaves
   * a job whose recorded progress is exactly the progress its stored rows
   * support.
   */
  private async process(context: JobContext, job: AssetJob, signal: AbortSignal): Promise<void> {
    const outstanding = remainingSentenceIds(job);
    let counts: TranslationJobCounts = {
      total: context.total,
      requested: job.orderedSentenceIds.length,
      completed: job.completedSentenceIds.length,
      failed: job.failedItems.length,
    };

    if (outstanding.length === 0) {
      this.controller = null;
      this.progressSignal.set({ kind: 'complete', readingId: context.readingId, counts });
      this.logger.info('job.succeeded', { kind: 'translation', count: counts.completed });
      return;
    }

    const loaded = await this.readings.loadSentences(outstanding);
    if (!loaded.ok) {
      this.failStorage(context.readingId, loaded.error, counts);
      return;
    }

    if (job.state !== 'running') {
      const started = await this.jobs.setState(job.id, 'running');
      if (!started.ok) {
        this.failStorage(context.readingId, started.error, counts);
        return;
      }
    }

    this.progressSignal.set({ kind: 'running', readingId: context.readingId, counts });
    // Assembled here rather than in `plan`, so queueing a reading the lane may
    // never reach reads nothing beyond its sentence refs. It then travels from
    // one batch to the next carrying what the last one settled, because each
    // batch is an independent request and nothing else pins how a name was
    // rendered in the one before it.
    let translationContext = await this.readingContext(context);
    let firstError: AiError | null = null;

    for (const batch of planBatches(loaded.value, MAX_TRANSLATION_BATCH)) {
      if (isAborted(signal)) {
        await this.markCancelled(job, counts);
        return;
      }
      if (this.yieldRequested) {
        await this.markPaused(job, counts);
        return;
      }

      const outcome = await this.translation.run(
        batch,
        context.readingId,
        context.cacheKeys,
        context.modelId,
        PROMPT_VERSIONS.translation,
        context.taskConfig,
        signal,
        translationContext,
      );
      translationContext = {
        ...translationContext,
        establishedRenderings: outcome.establishedRenderings,
      };

      // Whatever this batch already returned is stored before cancellation is
      // honoured: the request was paid for and the results are independently
      // useful, so discarding them would be a worse answer to "stop" than
      // keeping them.
      for (const record of outcome.records) {
        const stored = await this.translation.store(record, context.cacheKeys);
        if (!stored.ok) {
          this.failStorage(context.readingId, stored.error, counts);
          return;
        }
        const advanced = await this.jobs.recordCompletion(job.id, record.sentenceId);
        if (!advanced.ok) {
          this.failStorage(context.readingId, advanced.error, counts);
          return;
        }
        counts = { ...counts, completed: advanced.value.completedSentenceIds.length };
        this.progressSignal.set({ kind: 'running', readingId: context.readingId, counts });
      }

      if (isAborted(signal)) {
        await this.markCancelled(job, counts);
        return;
      }

      if (outcome.failures.length > 0) {
        const error =
          outcome.error ??
          aiError('unknown', 'translation', 'The translation request failed.', {
            detail: { correlationId: 'translation-job' },
          });
        const recorded = await this.recordFailures(job, outcome.failures, error);
        if (recorded === null) {
          return;
        }
        counts = { ...counts, failed: recorded.failedItems.length };
        firstError ??= error;
        // The split audio already draws (ADR 0035). A batch that failed for a
        // reason local to its sentences leaves the rest of a long reading
        // perfectly translatable, so the queue continues and the failure is
        // reported at the end. A configuration-wide refusal will refuse every
        // remaining batch identically, and spending on that is not a service.
        if (!isSentenceLocalFailure(error)) {
          const marked = await this.jobs.setState(job.id, 'failed');
          if (!marked.ok) {
            this.failStorage(context.readingId, marked.error, counts);
            return;
          }
          this.failProvider(context.readingId, error, counts);
          return;
        }
        this.progressSignal.set({ kind: 'running', readingId: context.readingId, counts });
      }
    }

    this.controller = null;
    if (firstError !== null) {
      const marked = await this.jobs.setState(job.id, 'failed');
      if (!marked.ok) {
        this.failStorage(context.readingId, marked.error, counts);
        return;
      }
      this.failProvider(context.readingId, firstError, counts);
      return;
    }
    this.progressSignal.set({ kind: 'complete', readingId: context.readingId, counts });
    this.logger.info('job.succeeded', { kind: 'translation', count: counts.completed });
  }

  private async recordFailures(
    job: AssetJob,
    sentenceIds: readonly SentenceId[],
    error: AiError,
  ): Promise<AssetJob | null> {
    let latest = job;
    const failedAt = this.clock.now();
    for (const sentenceId of sentenceIds) {
      const recorded = await this.jobs.recordFailure(job.id, {
        sentenceId,
        errorCode: error.code,
        failedAt,
      });
      if (!recorded.ok) {
        this.failStorage(job.readingId, recorded.error, emptyCounts());
        return null;
      }
      latest = recorded.value;
    }
    return latest;
  }

  /**
   * Parks the run where it stands, keeping the row for whoever resumes it.
   *
   * The state is `paused`, never `cancelled`: the difference is what every
   * screen watching a run does next.
   */
  private async markPaused(job: AssetJob, counts: TranslationJobCounts): Promise<void> {
    this.yieldRequested = false;
    this.controller = null;
    await this.jobs.setState(job.id, 'paused');
    this.progressSignal.set({ kind: 'paused', readingId: job.readingId, counts });
    this.logger.info('job.paused', { kind: 'translation', count: counts.completed });
  }

  private report(readingId: ReadingId, error: LayerError): void {
    if (error.source === 'provider') {
      this.failProvider(readingId, error.error, emptyCounts());
    } else {
      this.failStorage(readingId, error.error, emptyCounts());
    }
  }

  private async markCancelled(job: AssetJob, counts: TranslationJobCounts): Promise<void> {
    this.controller = null;
    const marked = await this.jobs.setState(job.id, 'cancelled');
    if (!marked.ok) {
      this.failStorage(job.readingId, marked.error, counts);
      return;
    }
    this.progressSignal.set({ kind: 'cancelled', readingId: job.readingId, counts });
    this.logger.info('job.cancelled', { kind: 'translation', count: counts.completed });
  }

  private failProvider(readingId: ReadingId, error: AiError, counts: TranslationJobCounts): void {
    this.controller = null;
    this.progressSignal.set({
      kind: 'failed',
      readingId,
      counts,
      error: { source: 'provider', error },
    });
    this.logger.error('job.failed', {
      kind: 'translation',
      errorDomain: error.domain,
      errorCode: error.code,
    });
  }

  private failStorage(
    readingId: ReadingId,
    error: StorageError,
    counts: TranslationJobCounts,
  ): void {
    this.controller = null;
    this.progressSignal.set({
      kind: 'failed',
      readingId,
      counts,
      error: { source: 'storage', error },
    });
    this.logger.error('job.failed', {
      kind: 'translation',
      errorDomain: error.domain,
      errorCode: error.code,
    });
  }
}

function emptyCounts(): TranslationJobCounts {
  return { total: 0, requested: 0, completed: 0, failed: 0 };
}

/**
 * Distinct proper nouns in the reading, in reading order.
 *
 * Names are the terms whose English rendering has to stay stable across
 * batches, and the analyzer already labelled them when the text was saved. The
 * order follows the sentence refs rather than the order storage happened to
 * return, so the same reading always produces the same request.
 */
function properNouns(
  refs: readonly SentenceRef[],
  analyses: readonly TokenAnalysis[],
): readonly string[] {
  const bySentenceId = new Map(analyses.map((analysis) => [analysis.sentenceId, analysis]));
  const surfaces = new Set<string>();
  for (const ref of refs) {
    for (const token of bySentenceId.get(ref.id)?.tokens ?? []) {
      if (token.partOfSpeech === 'proper-noun') {
        surfaces.add(token.surface);
      }
    }
  }
  return [...surfaces];
}

/**
 * Whether this refusal is about these sentences rather than about the setup.
 *
 * A transport hiccup or a reply that did not parse says nothing about the next
 * batch; a rejected key or an unsupported capability says everything about it.
 */
function isSentenceLocalFailure(error: AiError): boolean {
  return isAutomaticallyRetryable(error) || error.code === 'malformed-response';
}
