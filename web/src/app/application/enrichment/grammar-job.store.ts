import { Injectable, inject } from '@angular/core';
import { aiError, type AiError } from '../../domain/ai/ai-error';
import { planGrammarBatches } from '../../domain/ai/grammar-review-request';
import { PROMPT_VERSIONS } from '../../domain/ai/prompt-versions';
import type { TextTaskConfig } from '../../domain/ai/text-generation-provider';
import { grammarConfigFingerprint } from '../../domain/enrichment/cache-keys';
import { remainingSentenceIds, type AssetJob, type JobState } from '../../domain/enrichment/jobs';
import type { GrammarProfileSnapshot } from '../../domain/grammar/profile';
import type { Sentence } from '../../domain/reading/text-hierarchy';
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
import { PreparationPacer, backOffOnRateLimit } from './preparation-pacer';
import { GrammarAnalysisService } from './grammar-analysis.service';
import type {
  EnqueueOutcome,
  GrammarProgressPhase,
  LayerCounts,
  LayerError,
} from './layer-progress';
import {
  ReadingJobLifecycle,
  countsFor,
  enqueueOutcome,
  unavailable,
  type PlanOutcome,
  type ReadingJobProgress,
  type ReadingJobRun,
} from './reading-job-lifecycle';

export type GrammarJobError = LayerError;
export type GrammarJobCounts = LayerCounts;

/** What a running grammar run adds: the phase the reader reports. */
interface GrammarRunning {
  readonly phase: GrammarProgressPhase;
}

export type GrammarJobProgress = ReadingJobProgress<GrammarRunning>;

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
  private readonly pacer = inject(PreparationPacer);
  private readonly textModel = inject(TextModelStore);
  private readonly grammarProfile = inject(GrammarProfileStore);
  private readonly language = inject(LanguageStore);
  private readonly hasher = inject(HASHER);
  private readonly clock = inject(CLOCK);
  private readonly ids = inject(ID_GENERATOR);
  private readonly logger = inject<Logger>(LOGGER, { optional: true }) ?? NOOP_LOGGER;

  private readonly lifecycle = new ReadingJobLifecycle<JobContext, GrammarRunning>({
    jobKind: 'analyze-reading',
    task: 'grammar-review',
    logKind: 'grammar',
    jobs: this.jobs,
    logger: this.logger,
    failure: {},
    plan: (readingId) => this.plan(readingId, 'current-configuration', 'running'),
    process: (context, job, run) => this.process(context, job, run),
  });

  readonly progress = this.lifecycle.progress;
  readonly isRunning = this.lifecycle.isRunning;
  readonly idleProgress = this.lifecycle.idleProgress;

  progressFor(readingId: ReadingId): GrammarJobProgress {
    return this.lifecycle.progressFor(readingId);
  }

  /** A run parked between batches is still in progress for the learner, as for audio. */
  isRunningFor(readingId: ReadingId): boolean {
    return this.lifecycle.isRunningFor(readingId);
  }

  /**
   * Queues this reading without issuing a single request. The row covers the
   * sentences never analysed under any configuration.
   */
  async enqueue(readingId: ReadingId): Promise<EnqueueOutcome> {
    return enqueueOutcome(await this.plan(readingId, 'never-prepared', 'queued'));
  }

  /** Asks this run to stop at the next batch boundary and stay resumable. */
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
  ): Promise<PlanOutcome<JobContext>> {
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
      return { kind: 'nothing-to-do', total: context.total };
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

  private async process(context: JobContext, job: AssetJob, run: ReadingJobRun): Promise<void> {
    const { signal } = run;
    const outstanding = remainingSentenceIds(job);
    let counts = countsFor(context.total, job);
    const loaded = await this.readings.loadSentences(outstanding);
    if (!loaded.ok) {
      this.lifecycle.fail(context.readingId, loaded.error, counts);
      return;
    }
    if (job.state !== 'running') {
      const started = await this.jobs.setState(job.id, 'running');
      if (!started.ok) {
        this.lifecycle.fail(context.readingId, started.error, counts);
        return;
      }
    }
    const publish = (phase: GrammarProgressPhase): void => {
      this.lifecycle.publish({ kind: 'running', readingId: context.readingId, counts, phase });
    };
    publish('requesting');
    // A holder rather than two `let`s, so what one batch records is still
    // visible to the checks that run after every batch has settled.
    const outcome: { firstError: AiError | null; storage: StorageError | null } = {
      firstError: null,
      storage: null,
    };

    const batches = planGrammarBatches(
      orderedByReading(loaded.value),
      context.profile.resolvedGuidance,
      context.profile.registerPreference,
      (sentence) => sentence.japaneseText,
    );
    /**
     * One batch, from its turn in the queue to its rows on disk.
     *
     * Every batch waits for the shared pacer, so grammar for the beginning of
     * the reading is asked for before English for the end of it, and the three
     * layers fill the reading together rather than one after another.
     */
    const runBatch = async (batch: readonly Sentence[]): Promise<void> => {
      let permit;
      try {
        permit = await this.pacer.acquire(batch[0].positionInReading, 'grammar', signal);
      } catch {
        // Cancelled while still queued: nothing was requested, so there is
        // nothing to store and nothing to record.
        return;
      }
      const startedAt = this.clock.now();
      let result;
      try {
        // Checked here rather than before the permit: a batch can wait a long
        // time for its turn, and what stopped the run may have happened while
        // it did.
        if (outcome.storage !== null || isAborted(signal) || this.lifecycle.yieldRequested) {
          return;
        }
        publish('requesting');
        result = await this.grammar.runBatch(
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
        );
      } finally {
        permit.release();
      }
      // Shape only: where in the reading, how much, and how long. Never the
      // sentences themselves and never the provider's reply.
      this.logger.info('job.batch', {
        kind: 'grammar',
        step: batch[0].positionInReading,
        count: batch.length,
        durationMs: this.clock.now() - startedAt,
      });

      if (result.status === 'complete') {
        publish('saving');
        for (const record of result.records) {
          const stored = await this.grammar.store(record, context.cacheKeys);
          if (!stored.ok) {
            outcome.storage ??= stored.error;
            return;
          }
          const advanced = await this.jobs.recordCompletion(job.id, record.sentenceId);
          if (!advanced.ok) {
            outcome.storage ??= advanced.error;
            return;
          }
          counts = { ...counts, completed: advanced.value.completedSentenceIds.length };
          publish('saving');
        }
        return;
      }
      if (result.error.code === 'cancelled') {
        return;
      }
      backOffOnRateLimit(this.pacer, result.error);
      outcome.firstError ??= result.error;
      for (const sentence of batch) {
        const recorded = await this.jobs.recordFailure(job.id, {
          sentenceId: sentence.id,
          errorCode: result.error.code,
          failedAt: this.clock.now(),
        });
        if (!recorded.ok) {
          outcome.storage ??= recorded.error;
          return;
        }
        counts = { ...counts, failed: recorded.value.failedItems.length };
      }
      publish('saving');
    };

    await Promise.all(batches.map((batch) => runBatch(batch)));

    if (outcome.storage !== null) {
      this.lifecycle.fail(context.readingId, outcome.storage, counts);
      return;
    }
    await this.lifecycle.settle(job, counts, run, outcome.firstError);
  }
}

/**
 * Reading order, asserted here rather than assumed of the repository.
 *
 * Batches are addressed by the position of their first sentence, so a batch
 * built from whatever order storage returned would be handed to the pacer under
 * a position that is not its own.
 */
function orderedByReading(sentences: readonly Sentence[]): readonly Sentence[] {
  return [...sentences].sort((left, right) => left.positionInReading - right.positionInReading);
}
