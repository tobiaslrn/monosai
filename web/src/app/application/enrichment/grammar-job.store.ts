import { Injectable, computed, inject, signal } from '@angular/core';
import { aiError, type AiError } from '../../domain/ai/ai-error';
import { planGrammarBatches } from '../../domain/ai/grammar-review-request';
import { PROMPT_VERSIONS } from '../../domain/ai/prompt-versions';
import type { TextTaskConfig } from '../../domain/ai/text-generation-provider';
import { planBatches } from '../../domain/ai/translation-request';
import { grammarConfigFingerprint } from '../../domain/enrichment/cache-keys';
import { remainingSentenceIds, type AssetJob, type JobState } from '../../domain/enrichment/jobs';
import type { GrammarProfileSnapshot } from '../../domain/grammar/profile';
import { jobId, type ReadingId, type SentenceId } from '../../domain/shared/ids';
import type { Result } from '../../domain/shared/result';
import type { StorageError } from '../../domain/storage/storage-error';
import { GrammarProfileStore } from '../grammar/grammar-profile.store';
import { LanguageStore } from '../language/language.store';
import { LOGGER, NOOP_LOGGER, type Logger } from '../shared/diagnostics';
import {
  CLOCK,
  HASHER,
  ID_GENERATOR,
  JOB_REPOSITORY,
  READING_REPOSITORY,
} from '../shared/repository-tokens';
import { TextModelStore } from '../settings/text-model.store';
import { EnrichmentKeysService } from './enrichment-keys.service';
import { GrammarAnalysisService } from './grammar-analysis.service';
import {
  NOTHING_TO_DO,
  QUEUED,
  type EnqueueOutcome,
  type GrammarProgressPhase,
  type LayerError,
} from './layer-progress';

export type GrammarJobError =
  | { readonly source: 'provider'; readonly error: AiError }
  | { readonly source: 'storage'; readonly error: StorageError };

export interface GrammarJobCounts {
  readonly total: number;
  readonly requested: number;
  readonly completed: number;
  readonly failed: number;
}

export type GrammarJobProgress =
  | { readonly kind: 'idle' }
  | { readonly kind: 'preparing'; readonly readingId: ReadingId }
  | {
      readonly kind: 'running';
      readonly readingId: ReadingId;
      readonly counts: GrammarJobCounts;
      readonly phase: GrammarProgressPhase;
    }
  | { readonly kind: 'complete'; readonly readingId: ReadingId; readonly counts: GrammarJobCounts }
  | { readonly kind: 'cancelled'; readonly readingId: ReadingId; readonly counts: GrammarJobCounts }
  | { readonly kind: 'paused'; readonly readingId: ReadingId; readonly counts: GrammarJobCounts }
  | { readonly kind: 'deleted'; readonly readingId: ReadingId }
  | {
      readonly kind: 'failed';
      readonly readingId: ReadingId;
      readonly counts: GrammarJobCounts;
      readonly error: GrammarJobError;
    };

const IDLE: GrammarJobProgress = { kind: 'idle' };

/** Three grammar requests plus three translation requests make the six-request text ceiling. */
export const GRAMMAR_REQUEST_CONCURRENCY = 3;

function isAborted(signal: AbortSignal): boolean {
  return signal.aborted;
}

/**
 * Which sentences a newly created job covers.
 *
 * `current-configuration` is what an explicit analysis asks; `never-prepared`
 * is what the lane queues, so changing the model or the profile queues nothing.
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

interface JobContext {
  readonly readingId: ReadingId;
  readonly modelId: string;
  readonly taskConfig: TextTaskConfig;
  readonly profile: GrammarProfileSnapshot;
  readonly cacheKeys: ReadonlyMap<SentenceId, string>;
  readonly fingerprint: string;
  readonly total: number;
}

/** Resumable whole-reading grammar analysis in bounded request waves. */
@Injectable({ providedIn: 'root' })
export class GrammarJobStore {
  private readonly readings = inject(READING_REPOSITORY);
  private readonly jobs = inject(JOB_REPOSITORY);
  private readonly grammar = inject(GrammarAnalysisService);
  private readonly keys = inject(EnrichmentKeysService);
  private readonly textModel = inject(TextModelStore);
  private readonly grammarProfile = inject(GrammarProfileStore);
  private readonly language = inject(LanguageStore);
  private readonly hasher = inject(HASHER);
  private readonly clock = inject(CLOCK);
  private readonly ids = inject(ID_GENERATOR);
  private readonly logger = inject<Logger>(LOGGER, { optional: true }) ?? NOOP_LOGGER;

  private readonly progressSignal = signal<GrammarJobProgress>(IDLE);
  private controller: AbortController | null = null;
  private activeRun: Promise<void> | null = null;
  private yieldRequested = false;

  readonly progress = this.progressSignal.asReadonly();
  readonly isRunning = computed(() => {
    const kind = this.progressSignal().kind;
    return kind === 'preparing' || kind === 'running';
  });

  progressFor(readingId: ReadingId): GrammarJobProgress {
    const progress = this.progressSignal();
    return progress.kind !== 'idle' && progress.readingId === readingId ? progress : IDLE;
  }

  isRunningFor(readingId: ReadingId): boolean {
    const kind = this.progressFor(readingId).kind;
    return kind === 'preparing' || kind === 'running';
  }

  /**
   * Queues this reading without issuing a single request. The row covers the
   * sentences never analysed under any configuration.
   */
  async enqueue(readingId: ReadingId): Promise<EnqueueOutcome> {
    const prepared = await this.plan(readingId, 'never-prepared', 'queued');
    if (prepared.kind !== 'planned') {
      return prepared.kind === 'nothing-to-do' ? NOTHING_TO_DO : prepared.outcome;
    }
    return remainingSentenceIds(prepared.job).length === 0 ? NOTHING_TO_DO : QUEUED;
  }

  /** Asks this run to stop at the next batch boundary and stay resumable. */
  yieldAfterBatch(): void {
    if (this.isRunning()) {
      this.yieldRequested = true;
    }
  }

  async start(readingId: ReadingId): Promise<void> {
    if (this.activeRun !== null) {
      await this.activeRun;
      return;
    }
    const run = this.run(readingId);
    this.activeRun = run;
    try {
      await run;
    } finally {
      if (this.activeRun === run) this.activeRun = null;
    }
  }

  private async run(readingId: ReadingId): Promise<void> {
    const controller = new AbortController();
    this.controller = controller;
    this.yieldRequested = false;
    this.logger.info('job.started', { kind: 'grammar' });
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

  async resume(readingId: ReadingId): Promise<void> {
    if (this.isRunning()) return;
    const existing = await this.jobs.findActive(readingId, 'analyze-reading');
    if (!existing.ok) {
      this.failStorage(readingId, existing.error, emptyCounts());
      return;
    }
    if (existing.value === null) {
      if (this.progressFor(readingId).kind !== 'idle') this.progressSignal.set(IDLE);
      return;
    }
    await this.start(readingId);
  }

  retry(readingId: ReadingId): Promise<void> {
    return this.start(readingId);
  }

  cancel(readingId: ReadingId): void {
    if (!this.owns(readingId)) return;
    this.controller?.abort();
    this.controller = null;
    const progress = this.progressSignal();
    const counts = progress.kind === 'running' ? progress.counts : emptyCounts();
    this.progressSignal.set({ kind: 'cancelled', readingId, counts });
  }

  async cancelAndWait(readingId: ReadingId): Promise<void> {
    this.cancel(readingId);
    await this.activeRun;
  }

  async readingDeleted(readingId: ReadingId): Promise<void> {
    if (!this.owns(readingId)) return;
    await this.cancelAndWait(readingId);
    this.progressSignal.set({ kind: 'deleted', readingId });
  }

  acknowledge(readingId: ReadingId): void {
    if (this.owns(readingId) && !this.isRunningFor(readingId)) this.progressSignal.set(IDLE);
  }

  private owns(readingId: ReadingId): boolean {
    const progress = this.progressSignal();
    return progress.kind !== 'idle' && progress.readingId === readingId;
  }

  /**
   * Resolves configuration, keys, and the job row this run will advance.
   *
   * A stored job whose `configFingerprint` no longer matches is closed rather
   * than resumed: its remaining items were chosen against a model or a profile
   * that is no longer in force.
   */
  private async plan(
    readingId: ReadingId,
    scope: JobScope,
    initialState: JobState,
  ): Promise<PlanOutcome> {
    await this.language.initialize();
    const configured = this.textModel.configForTask('grammar');
    if (configured === null) {
      return unavailable({
        source: 'provider',
        error: aiError(
          'capability-unsupported',
          'grammar-review',
          'No tested text model is available for grammar analysis.',
          { detail: { capability: 'structured-output' } },
        ),
      });
    }
    const captured = await this.grammarProfile.captureProfile();
    if (!captured.ok) {
      return unavailable({ source: 'storage', error: captured.error });
    }
    const refs = await this.readings.listSentenceRefs(readingId);
    if (!refs.ok) {
      return unavailable({ source: 'storage', error: refs.error });
    }
    const profile = captured.value;
    const cacheKeys = this.keys.grammarKeys(
      refs.value,
      configured.modelId,
      PROMPT_VERSIONS.grammar,
      profile.profileHash,
    );
    const context: JobContext = {
      readingId,
      modelId: configured.modelId,
      taskConfig: configured,
      profile,
      cacheKeys,
      fingerprint: grammarConfigFingerprint(
        this.hasher,
        configured.modelId,
        PROMPT_VERSIONS.grammar,
        profile.profileHash,
      ),
      total: refs.value.length,
    };
    const active = await this.jobs.findActive(readingId, 'analyze-reading');
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
        ? await this.grammar.neverPreparedSentenceIds(context.cacheKeys)
        : await this.grammar.missingSentenceIds(context.cacheKeys);
    if (!wanted.ok) {
      return unavailable({ source: 'storage', error: wanted.error });
    }
    // No row is written for a reading with nothing outstanding: an empty job
    // could never complete itself, and the lane would pick it up forever.
    if (wanted.value.length === 0) {
      return { kind: 'nothing-to-do', context };
    }
    const created = await this.createJob(context, wanted.value, initialState);
    return created.ok
      ? { kind: 'planned', context, job: created.value }
      : unavailable({ source: 'storage', error: created.error });
  }

  private async reconcile(
    context: JobContext,
    job: AssetJob,
  ): Promise<Result<AssetJob, StorageError>> {
    const missing = await this.grammar.missingSentenceIds(context.cacheKeys);
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
      kind: 'analyze-reading',
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

  private async process(context: JobContext, job: AssetJob, signal: AbortSignal): Promise<void> {
    const outstanding = remainingSentenceIds(job);
    let counts: GrammarJobCounts = {
      total: context.total,
      requested: job.orderedSentenceIds.length,
      completed: job.completedSentenceIds.length,
      failed: job.failedItems.length,
    };
    if (outstanding.length === 0) {
      this.controller = null;
      this.progressSignal.set({ kind: 'complete', readingId: context.readingId, counts });
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
    this.progressSignal.set({
      kind: 'running',
      readingId: context.readingId,
      counts,
      phase: 'requesting',
    });
    let firstError: AiError | null = null;

    const batches = planGrammarBatches(
      loaded.value,
      context.profile.resolvedGuidance,
      context.profile.registerPreference,
      (sentence) => sentence.japaneseText,
    );
    let waveNumber = 0;
    for (const wave of planBatches(batches, GRAMMAR_REQUEST_CONCURRENCY)) {
      waveNumber += 1;
      if (isAborted(signal)) {
        await this.markCancelled(job, counts);
        return;
      }
      if (this.yieldRequested) {
        await this.markPaused(job, counts);
        return;
      }
      this.progressSignal.set({
        kind: 'running',
        readingId: context.readingId,
        counts,
        phase: 'requesting',
      });
      const startedAt = this.clock.now();
      const settled = await Promise.all(
        wave.map(async (batch) => ({
          batch,
          outcome: await this.grammar.runBatch(
            batch,
            context.readingId,
            context.cacheKeys,
            context.profile.profileHash,
            context.profile.resolvedGuidance,
            context.profile.registerPreference,
            context.modelId,
            PROMPT_VERSIONS.grammar,
            context.taskConfig,
            signal,
          ),
        })),
      );
      // Shape only: how much was asked for and how long it took. Never the
      // sentences themselves and never the provider's reply.
      this.logger.info('job.wave', {
        kind: 'grammar',
        step: waveNumber,
        worker: wave.length,
        count: wave.reduce((total, batch) => total + batch.length, 0),
        durationMs: this.clock.now() - startedAt,
      });
      for (const { batch, outcome } of settled) {
        if (outcome.status === 'complete') {
          this.progressSignal.set({
            kind: 'running',
            readingId: context.readingId,
            counts,
            phase: 'saving',
          });
          for (const record of outcome.records) {
            const stored = await this.grammar.store(record, context.cacheKeys);
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
            this.progressSignal.set({
              kind: 'running',
              readingId: context.readingId,
              counts,
              phase: 'saving',
            });
          }
        } else if (outcome.error.code !== 'cancelled') {
          firstError ??= outcome.error;
          for (const sentence of batch) {
            const recorded = await this.jobs.recordFailure(job.id, {
              sentenceId: sentence.id,
              errorCode: outcome.error.code,
              failedAt: this.clock.now(),
            });
            if (!recorded.ok) {
              this.failStorage(context.readingId, recorded.error, counts);
              return;
            }
            counts = { ...counts, failed: recorded.value.failedItems.length };
          }
          this.progressSignal.set({
            kind: 'running',
            readingId: context.readingId,
            counts,
            phase: 'saving',
          });
        }
      }
      if (isAborted(signal)) {
        await this.markCancelled(job, counts);
        return;
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
    const marked = await this.jobs.setState(job.id, 'complete');
    if (!marked.ok) {
      this.failStorage(context.readingId, marked.error, counts);
      return;
    }
    this.progressSignal.set({ kind: 'complete', readingId: context.readingId, counts });
    this.logger.info('job.succeeded', { kind: 'grammar', count: counts.completed });
  }

  /** Parks the run where it stands, keeping the row for whoever resumes it. */
  private async markPaused(job: AssetJob, counts: GrammarJobCounts): Promise<void> {
    this.yieldRequested = false;
    this.controller = null;
    const marked = await this.jobs.setState(job.id, 'paused');
    if (!marked.ok) {
      this.failStorage(job.readingId, marked.error, counts);
      return;
    }
    this.progressSignal.set({ kind: 'paused', readingId: job.readingId, counts });
    this.logger.info('job.paused', { kind: 'grammar', count: counts.completed });
  }

  private report(readingId: ReadingId, error: LayerError): void {
    if (error.source === 'provider') {
      this.failProvider(readingId, error.error, emptyCounts());
    } else {
      this.failStorage(readingId, error.error, emptyCounts());
    }
  }

  private async markCancelled(job: AssetJob, counts: GrammarJobCounts): Promise<void> {
    this.controller = null;
    const marked = await this.jobs.setState(job.id, 'cancelled');
    if (!marked.ok) {
      this.failStorage(job.readingId, marked.error, counts);
      return;
    }
    this.progressSignal.set({ kind: 'cancelled', readingId: job.readingId, counts });
    this.logger.info('job.cancelled', { kind: 'grammar', count: counts.completed });
  }

  private failProvider(readingId: ReadingId, error: AiError, counts: GrammarJobCounts): void {
    this.controller = null;
    this.progressSignal.set({
      kind: 'failed',
      readingId,
      counts,
      error: { source: 'provider', error },
    });
    this.logger.error('job.failed', {
      kind: 'grammar',
      errorDomain: error.domain,
      errorCode: error.code,
    });
  }

  private failStorage(readingId: ReadingId, error: StorageError, counts: GrammarJobCounts): void {
    this.controller = null;
    this.progressSignal.set({
      kind: 'failed',
      readingId,
      counts,
      error: { source: 'storage', error },
    });
    this.logger.error('job.failed', {
      kind: 'grammar',
      errorDomain: error.domain,
      errorCode: error.code,
    });
  }
}

function emptyCounts(): GrammarJobCounts {
  return { total: 0, requested: 0, completed: 0, failed: 0 };
}
