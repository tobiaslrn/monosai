import { Injectable, inject } from '@angular/core';
import { aiError, isAutomaticallyRetryable, type AiError } from '../../domain/ai/ai-error';
import { estimateTokens } from '../../domain/ai/context-budget';
import type { AssetJob } from '../../domain/enrichment/jobs';
import {
  translationPassageWindow,
  type ReadyTranslationPlan,
  TRANSLATION_INPUT_BUDGET_TOKENS,
} from '../../domain/enrichment/translation-plan';
import type { Sentence } from '../../domain/reading/text-hierarchy';
import type { ReadingId } from '../../domain/shared/ids';
import type { StorageError } from '../../domain/storage/storage-error';
import { LOGGER, NOOP_LOGGER, type Logger } from '../shared/diagnostics';
import { CLOCK, ENRICHMENT_REPOSITORY, JOB_REPOSITORY } from '../shared/repository-tokens';
import type { EnqueueOutcome, LayerCounts, LayerError } from './layer-progress';
import { PreparationPacer, backOffOnRateLimit } from './preparation-pacer';
import {
  ReadingJobLifecycle,
  countsFor,
  enqueueOutcome,
  type ReadingJobProgress,
  type ReadingJobRun,
} from './reading-job-lifecycle';
import {
  TranslationJobPlanner,
  type TranslationJobContext,
} from './translation-job-planner.service';
import {
  TranslationTerminologyService,
  translationContextFor,
  type TranslationRun,
} from './translation-terminology.service';
import { TranslationService } from './translation.service';

export type TranslationJobError = LayerError;
export type TranslationJobCounts = LayerCounts;
export type TranslationJobProgress = ReadingJobProgress;

export const MAX_ACTIVE_TRANSLATION_REQUESTS = 3;

@Injectable({ providedIn: 'root' })
export class TranslationJobStore {
  private readonly enrichment = inject(ENRICHMENT_REPOSITORY);
  private readonly jobs = inject(JOB_REPOSITORY);
  private readonly translation = inject(TranslationService);
  private readonly planner = inject(TranslationJobPlanner);
  private readonly terminology = inject(TranslationTerminologyService);
  private readonly pacer = inject(PreparationPacer);
  private readonly clock = inject(CLOCK);
  private readonly logger = inject<Logger>(LOGGER, { optional: true }) ?? NOOP_LOGGER;
  /** When the current run started and how many requests it made, for its diagnostics. */
  private runStartedAt = 0;
  private requestCount = 0;

  private readonly lifecycle = new ReadingJobLifecycle<TranslationJobContext>({
    jobKind: 'translate-reading',
    task: 'translation',
    logKind: 'translation',
    jobs: this.jobs,
    logger: this.logger,
    failure: {},
    onStart: () => {
      this.runStartedAt = this.clock.now();
      this.requestCount = 0;
    },
    plan: (readingId) => this.planner.plan(readingId, 'current-configuration', 'running'),
    process: (context, job, run) => this.process(context, job, run),
  });

  readonly progress = this.lifecycle.progress;
  readonly isRunning = this.lifecycle.isRunning;
  readonly idleProgress = this.lifecycle.idleProgress;

  progressFor(readingId: ReadingId): TranslationJobProgress {
    return this.lifecycle.progressFor(readingId);
  }

  /** A run parked between batches is still in progress for the learner, as for audio. */
  isRunningFor(readingId: ReadingId): boolean {
    return this.lifecycle.isRunningFor(readingId);
  }

  async enqueue(
    readingId: ReadingId,
    intent: 'automatic' | 'explicit' = 'automatic',
  ): Promise<EnqueueOutcome> {
    return enqueueOutcome(
      await this.planner.plan(
        readingId,
        intent === 'explicit' ? 'current-configuration' : 'never-prepared',
        'queued',
      ),
    );
  }

  yieldAfterBatch(): void {
    this.lifecycle.yieldAfterBatch();
  }

  start(readingId: ReadingId): Promise<void> {
    return this.lifecycle.start(readingId);
  }

  resume(readingId: ReadingId): Promise<void> {
    return this.lifecycle.resume(readingId);
  }

  retry(readingId: ReadingId): Promise<void> {
    return this.lifecycle.start(readingId);
  }

  cancel(readingId: ReadingId): void {
    this.lifecycle.cancel(readingId);
  }

  cancelAndWait(readingId: ReadingId): Promise<void> {
    return this.lifecycle.cancelAndWait(readingId);
  }

  readingDeleted(readingId: ReadingId): Promise<void> {
    return this.lifecycle.readingDeleted(readingId);
  }

  acknowledge(readingId: ReadingId): void {
    this.lifecycle.acknowledge(readingId);
  }

  private async process(
    context: TranslationJobContext,
    job: AssetJob,
    run: ReadingJobRun,
  ): Promise<void> {
    const { signal } = run;
    const terms: TranslationRun = {
      signal,
      startedAt: this.runStartedAt,
      withPermit: (position, request) => this.withPermit(position, signal, request),
      publish: (published) => {
        this.lifecycle.publish({
          kind: 'running',
          readingId: context.readingId,
          counts: published,
        });
      },
    };
    let counts = countsFor(context.total, job);
    if (job.state !== 'running') {
      const started = await this.jobs.setState(job.id, 'running');
      if (!started.ok) {
        this.lifecycle.fail(context.readingId, started.error, counts);
        return;
      }
    }
    this.lifecycle.publish({ kind: 'running', readingId: context.readingId, counts });
    let readyContext: TranslationJobContext | null =
      context.plan.state === 'ready' ? context : null;
    if (context.plan.state === 'opening-pending') {
      const established = await this.terminology.establishOpening(context, job, counts, terms);
      if (!established.ok) {
        if (isStop(established.error, signal)) {
          await this.lifecycle.halt(job, counts, run);
          return;
        }
        await this.lifecycle.markFailed(job, established.error, counts);
        return;
      }
      // No permit was granted: the run was stopped, or parked by the lane,
      // while the opening waited for its turn.
      if (established.value === null) {
        await this.lifecycle.halt(job, counts, run);
        return;
      }
      readyContext = established.value.context;
      counts = established.value.counts;
    } else if (context.plan.state === 'glossary-repair-required') {
      const repaired = await this.terminology.repairGlossary(context, job, counts, terms);
      if (!repaired.ok) {
        if (isStop(repaired.error, signal)) {
          await this.lifecycle.halt(job, counts, run);
          return;
        }
        await this.lifecycle.markFailed(job, repaired.error, counts);
        return;
      }
      readyContext = repaired.value.context;
      counts = repaired.value.counts;
    }
    if (readyContext === null) return;
    const tail = await this.runTail(readyContext, job, counts, signal);
    counts = tail.counts;
    if (tail.storage !== null) {
      this.lifecycle.fail(context.readingId, tail.storage, counts);
      return;
    }
    const settled = await this.lifecycle.settle(job, counts, run, tail.error);
    if (settled === 'complete') {
      this.logger.info('translation.completed', {
        durationMs: this.clock.now() - this.runStartedAt,
        count: counts.completed,
        requestCount: this.requestCount,
      });
    }
  }

  private async runTail(
    context: TranslationJobContext,
    job: AssetJob,
    initialCounts: TranslationJobCounts,
    signal: AbortSignal,
  ): Promise<{
    counts: TranslationJobCounts;
    error: AiError | null;
    storage: StorageError | null;
  }> {
    const plan = context.plan as ReadyTranslationPlan;
    const missing = await this.translation.missingSentenceIds(context.readingId, context.cacheKeys);
    if (!missing.ok) return { counts: initialCounts, error: null, storage: missing.error };
    const missingIds = new Set(missing.value);
    // What an earlier run of this row already failed stays a hole for Retry,
    // as it does for grammar and audio: a resumed job never retries on its own
    // (ADR 0048), so a yield cannot change how the job ends.
    const failedBefore = new Set(job.failedItems.map((failure) => failure.sentenceId));
    const groups = new Map<number, Sentence[]>();
    for (const sentence of context.sentences) {
      if (!missingIds.has(sentence.id) || failedBefore.has(sentence.id)) continue;
      const group = Math.floor(sentence.positionInReading / 10);
      const bucket = groups.get(group) ?? [];
      bucket.push(sentence);
      groups.set(group, bucket);
    }
    const batches = [...groups.values()];
    let counts = initialCounts;
    let firstError: AiError | null = null;
    let storage: StorageError | null = null;
    let next = 0;
    const worker = async (): Promise<void> => {
      while (storage === null && !signal.aborted && !this.lifecycle.yieldRequested) {
        const batch = batches[next++];
        if (batch === undefined) {
          break;
        }
        // Buckets are created by the sentence that fills them, so none is empty.
        const [first] = batch;
        if (first === undefined) {
          continue;
        }
        const passage = translationPassageWindow(context.sentences, first.positionInReading);
        const estimatedInput = estimateTokens(
          JSON.stringify({
            title: plan.title,
            premise: plan.premise,
            register: plan.register,
            glossary: plan.glossary,
            passage: passage.map((sentence) => sentence.japaneseText),
          }),
        );
        if (estimatedInput > TRANSLATION_INPUT_BUDGET_TOKENS) {
          const oversized = aiError(
            'context-budget-exceeded',
            'translation',
            'A sentence and its translation context are too large to send.',
            { detail: { issueCode: 'single-sentence-too-large' } },
          );
          for (const sentence of batch) {
            const failed = await this.jobs.recordFailure(job.id, {
              sentenceId: sentence.id,
              errorCode: oversized.code,
              failedAt: this.clock.now(),
            });
            if (!failed.ok) {
              storage ??= failed.error;
              return;
            }
            counts = { ...counts, failed: failed.value.failedItems.length };
          }
          firstError ??= oversized;
          continue;
        }
        const outcome = await this.withPermit(first.positionInReading, signal, () =>
          this.translation.run(
            batch,
            context.readingId,
            context.cacheKeys,
            context.modelId,
            plan.promptVersion,
            context.taskConfig,
            signal,
            {
              ...translationContextFor(plan, passage),
              requestKind: 'tail',
              skipCacheLookup: true,
            },
          ),
        );
        if (outcome === null) return;
        for (const record of outcome.records) {
          const stored = await this.enrichment.storeTranslationForPlan(
            record,
            context.cacheKeys,
            plan.planFingerprint,
          );
          if (!stored.ok) {
            storage ??= stored.error;
            return;
          }
          const advanced = await this.jobs.recordCompletion(job.id, record.sentenceId);
          if (!advanced.ok) {
            storage ??= advanced.error;
            return;
          }
          counts = { ...counts, completed: advanced.value.completedSentenceIds.length };
          this.lifecycle.publish({ kind: 'running', readingId: context.readingId, counts });
        }
        if (outcome.failures.length > 0 && outcome.error?.code !== 'cancelled') {
          const error =
            outcome.error ?? aiError('unknown', 'translation', 'The translation request failed.');
          backOffOnRateLimit(this.pacer, error);
          for (const sentenceId of outcome.failures) {
            const failed = await this.jobs.recordFailure(job.id, {
              sentenceId,
              errorCode: error.code,
              failedAt: this.clock.now(),
            });
            if (!failed.ok) {
              storage ??= failed.error;
              return;
            }
            counts = { ...counts, failed: failed.value.failedItems.length };
          }
          firstError ??= error;
          if (!isSentenceLocalFailure(error)) return;
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(MAX_ACTIVE_TRANSLATION_REQUESTS, batches.length) }, () =>
        worker(),
      ),
    );
    return { counts, error: firstError, storage };
  }

  private async withPermit<T>(
    position: number,
    signal: AbortSignal,
    run: () => Promise<T>,
  ): Promise<T | null> {
    let permit;
    try {
      permit = await this.pacer.acquire(position, 'english', signal);
    } catch {
      return null;
    }
    try {
      if (signal.aborted || this.lifecycle.yieldRequested) return null;
      this.requestCount += 1;
      return await run();
    } finally {
      permit.release();
    }
  }
}

function isSentenceLocalFailure(error: AiError): boolean {
  return isAutomaticallyRetryable(error) || error.code === 'malformed-response';
}

/** Whether a refusal is the run being stopped rather than a failure to report. */
function isStop(error: AiError | StorageError, signal: AbortSignal): boolean {
  return signal.aborted || (error.domain === 'ai' && error.code === 'cancelled');
}
