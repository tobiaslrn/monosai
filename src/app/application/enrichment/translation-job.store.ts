import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { aiError, type AiError } from '../../domain/ai/ai-error';
import { PROMPT_VERSIONS } from '../../domain/ai/prompt-versions';
import type { TextTaskConfig } from '../../domain/ai/text-generation-provider';
import { MAX_TRANSLATION_BATCH, planBatches } from '../../domain/ai/translation-request';
import { translationConfigFingerprint } from '../../domain/enrichment/cache-keys';
import { remainingSentenceIds, type AssetJob } from '../../domain/enrichment/jobs';
import { jobId, type ReadingId, type SentenceId } from '../../domain/shared/ids';
import type { StorageError } from '../../domain/storage/storage-error';
import {
  CLOCK,
  HASHER,
  ID_GENERATOR,
  JOB_REPOSITORY,
  READING_REPOSITORY,
} from '../shared/repository-tokens';
import { AppBusyRegistry } from '../shared/app-busy.registry';
import { TextModelStore } from '../settings/text-model.store';
import { EnrichmentKeysService } from './enrichment-keys.service';
import { TranslationService } from './translation.service';

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
  | { readonly kind: 'preparing' }
  | { readonly kind: 'running'; readonly counts: TranslationJobCounts }
  | { readonly kind: 'complete'; readonly counts: TranslationJobCounts }
  | { readonly kind: 'cancelled'; readonly counts: TranslationJobCounts }
  | {
      readonly kind: 'failed';
      readonly counts: TranslationJobCounts;
      readonly error: TranslationJobError;
    };

const IDLE: TranslationJobProgress = { kind: 'idle' };

/** Reads the flag through a call, so an earlier check never narrows a later one. */
function isAborted(signal: AbortSignal): boolean {
  return signal.aborted;
}

/** Everything one run needs, captured once so no setting can change mid-flight. */
interface JobContext {
  readonly readingId: ReadingId;
  readonly modelId: string;
  readonly taskConfig: TextTaskConfig;
  readonly cacheKeys: ReadonlyMap<SentenceId, string>;
  readonly fingerprint: string;
  readonly total: number;
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
  private readonly hasher = inject(HASHER);
  private readonly clock = inject(CLOCK);
  private readonly ids = inject(ID_GENERATOR);
  private readonly busyRegistry = inject(AppBusyRegistry);

  private readonly progressSignal = signal<TranslationJobProgress>(IDLE);
  private controller: AbortController | null = null;

  readonly progress = this.progressSignal.asReadonly();

  readonly isRunning = computed(() => {
    const kind = this.progressSignal().kind;
    return kind === 'preparing' || kind === 'running';
  });

  constructor() {
    effect(() => {
      this.busyRegistry.setBusy(
        'translation-job',
        this.isRunning() ? 'a translation job is running' : null,
      );
    });
  }

  /**
   * Translates everything in the reading that is missing a translation under
   * the current model and prompt.
   *
   * Reuses an active job whose configuration still matches, so pressing the
   * action twice continues one job rather than racing two.
   */
  async start(readingId: ReadingId): Promise<void> {
    if (this.isRunning()) {
      return;
    }
    // The controller exists before the first await so that cancelling while
    // configuration is still being read stops the run rather than being ignored.
    const controller = new AbortController();
    this.controller = controller;
    this.progressSignal.set({ kind: 'preparing' });

    const prepared = await this.prepare(readingId);
    if (prepared === null) {
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
      this.failStorage(existing.error, emptyCounts());
      return;
    }
    if (existing.value === null) {
      this.progressSignal.set(IDLE);
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
  cancel(): void {
    this.controller?.abort();
    this.controller = null;
    const progress = this.progressSignal();
    if (progress.kind === 'preparing') {
      this.progressSignal.set({ kind: 'cancelled', counts: emptyCounts() });
    } else if (progress.kind === 'running') {
      this.progressSignal.set({ kind: 'cancelled', counts: progress.counts });
    }
  }

  /**
   * Returns a settled job to rest, so its report leaves the reader.
   *
   * Only ever called for a run that has finished, been stopped, or failed:
   * dismissing the report of a run that is still scheduling batches would hide
   * work that is still spending requests.
   */
  acknowledge(): void {
    if (!this.isRunning()) {
      this.progressSignal.set(IDLE);
    }
  }

  /**
   * Resolves configuration, keys, and the job row this run will advance.
   *
   * A stored job whose `configFingerprint` no longer matches is closed rather
   * than resumed: its remaining items were chosen against a model that is no
   * longer configured, and continuing it would report two configurations'
   * output under one progress number.
   */
  private async prepare(
    readingId: ReadingId,
  ): Promise<{ readonly context: JobContext; readonly job: AssetJob } | null> {
    const settings = this.textModel.settings();
    const structuredOutput = settings.structuredOutput;
    if (settings.modelId === '' || structuredOutput === null) {
      this.failProvider(
        aiError(
          'capability-unsupported',
          'translation',
          'No tested text model is available for translation.',
          { detail: { capability: 'structured-output' } },
        ),
        emptyCounts(),
      );
      return null;
    }

    const refs = await this.readings.listSentenceRefs(readingId);
    if (!refs.ok) {
      this.failStorage(refs.error, emptyCounts());
      return null;
    }

    const context: JobContext = {
      readingId,
      modelId: settings.modelId,
      taskConfig: { modelId: settings.modelId, structuredOutput },
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
    };

    const active = await this.jobs.findActive(readingId, 'translate-reading');
    if (!active.ok) {
      this.failStorage(active.error, emptyCounts());
      return null;
    }

    if (active.value !== null && active.value.configFingerprint === context.fingerprint) {
      const reconciled = await this.reconcile(context, active.value);
      return reconciled === null ? null : { context, job: reconciled };
    }

    if (active.value !== null) {
      const closed = await this.jobs.setState(active.value.id, 'cancelled');
      if (!closed.ok) {
        this.failStorage(closed.error, emptyCounts());
        return null;
      }
    }

    const created = await this.createJob(context);
    return created === null ? null : { context, job: created };
  }

  /** Re-derives completion from stored rows, so a reload never over-reports. */
  private async reconcile(context: JobContext, job: AssetJob): Promise<AssetJob | null> {
    const missing = await this.missingSentenceIds(context);
    if (missing === null) {
      return null;
    }
    const outstanding = new Set(missing);
    const completed = job.orderedSentenceIds.filter((id) => !outstanding.has(id));
    const updated = await this.jobs.reconcile(job.id, completed);
    if (!updated.ok) {
      this.failStorage(updated.error, emptyCounts());
      return null;
    }
    return updated.value;
  }

  private async createJob(context: JobContext): Promise<AssetJob | null> {
    const missing = await this.missingSentenceIds(context);
    if (missing === null) {
      return null;
    }
    const now = this.clock.now();
    const created = await this.jobs.create({
      id: jobId(this.ids.nextId()),
      kind: 'translate-reading',
      readingId: context.readingId,
      state: 'running',
      orderedSentenceIds: missing,
      completedSentenceIds: [],
      failedItems: [],
      configFingerprint: context.fingerprint,
      createdAt: now,
      updatedAt: now,
    });
    if (!created.ok) {
      this.failStorage(created.error, emptyCounts());
      return null;
    }
    return created.value;
  }

  private async missingSentenceIds(context: JobContext): Promise<readonly SentenceId[] | null> {
    const missing = await this.translation.missingSentenceIds(context.readingId, context.cacheKeys);
    if (!missing.ok) {
      this.failStorage(missing.error, emptyCounts());
      return null;
    }
    return missing.value;
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
      this.progressSignal.set({ kind: 'complete', counts });
      return;
    }

    const loaded = await this.readings.loadSentences(outstanding);
    if (!loaded.ok) {
      this.failStorage(loaded.error, counts);
      return;
    }

    if (job.state !== 'running') {
      const started = await this.jobs.setState(job.id, 'running');
      if (!started.ok) {
        this.failStorage(started.error, counts);
        return;
      }
    }

    this.progressSignal.set({ kind: 'running', counts });

    for (const batch of planBatches(loaded.value, MAX_TRANSLATION_BATCH)) {
      if (isAborted(signal)) {
        await this.markCancelled(job, counts);
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
      );

      // Whatever this batch already returned is stored before cancellation is
      // honoured: the request was paid for and the results are independently
      // useful, so discarding them would be a worse answer to "stop" than
      // keeping them.
      for (const record of outcome.records) {
        const stored = await this.translation.store(record, context.cacheKeys);
        if (!stored.ok) {
          this.failStorage(stored.error, counts);
          return;
        }
        const advanced = await this.jobs.recordCompletion(job.id, record.sentenceId);
        if (!advanced.ok) {
          this.failStorage(advanced.error, counts);
          return;
        }
        counts = { ...counts, completed: advanced.value.completedSentenceIds.length };
        this.progressSignal.set({ kind: 'running', counts });
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
        const marked = await this.jobs.setState(job.id, 'failed');
        if (!marked.ok) {
          this.failStorage(marked.error, counts);
          return;
        }
        this.failProvider(error, counts);
        return;
      }
    }

    this.controller = null;
    this.progressSignal.set({ kind: 'complete', counts });
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
        this.failStorage(recorded.error, emptyCounts());
        return null;
      }
      latest = recorded.value;
    }
    return latest;
  }

  private async markCancelled(job: AssetJob, counts: TranslationJobCounts): Promise<void> {
    this.controller = null;
    await this.jobs.setState(job.id, 'cancelled');
    this.progressSignal.set({ kind: 'cancelled', counts });
  }

  private failProvider(error: AiError, counts: TranslationJobCounts): void {
    this.controller = null;
    this.progressSignal.set({ kind: 'failed', counts, error: { source: 'provider', error } });
  }

  private failStorage(error: StorageError, counts: TranslationJobCounts): void {
    this.controller = null;
    this.progressSignal.set({ kind: 'failed', counts, error: { source: 'storage', error } });
  }
}

function emptyCounts(): TranslationJobCounts {
  return { total: 0, requested: 0, completed: 0, failed: 0 };
}
