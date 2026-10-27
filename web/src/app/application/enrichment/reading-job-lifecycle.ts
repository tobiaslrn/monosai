import { computed, signal } from '@angular/core';
import { ALL_AI_ERROR_CODES, aiError, type AiError } from '../../domain/ai/ai-error';
import type { AiTask } from '../../domain/ai/ai-task';
import type { JobRepository } from '../../domain/enrichment/job-repository';
import {
  remainingSentenceIds,
  type AssetJob,
  type AssetJobKind,
} from '../../domain/enrichment/jobs';
import type { ReadingId } from '../../domain/shared/ids';
import { storageError, type StorageError } from '../../domain/storage/storage-error';
import type { Logger } from '../shared/diagnostics';
import {
  NOTHING_TO_DO,
  QUEUED,
  type EnqueueOutcome,
  type LayerCounts,
  type LayerError,
} from './layer-progress';

/**
 * One layer's state for one reading, as its job store publishes it.
 *
 * The three stores agree on every state and differ in two details only: a
 * running grammar run names its phase, and a failed audio run says whether
 * running it again could help. Those two are the parameters.
 */
export type ReadingJobProgress<Running extends object = object, Failure extends object = object> =
  | { readonly kind: 'idle' }
  | { readonly kind: 'preparing'; readonly readingId: ReadingId }
  | ({
      readonly kind: 'running';
      readonly readingId: ReadingId;
      readonly counts: LayerCounts;
    } & Running)
  | { readonly kind: 'complete'; readonly readingId: ReadingId; readonly counts: LayerCounts }
  | { readonly kind: 'cancelled'; readonly readingId: ReadingId; readonly counts: LayerCounts }
  | { readonly kind: 'paused'; readonly readingId: ReadingId; readonly counts: LayerCounts }
  | { readonly kind: 'deleted'; readonly readingId: ReadingId }
  | ({
      readonly kind: 'failed';
      readonly readingId: ReadingId;
      readonly counts: LayerCounts;
      readonly error: LayerError;
    } & Failure);

/** What resolving a run's configuration and job row came to. */
export type PlanOutcome<Context> =
  | { readonly kind: 'planned'; readonly context: Context; readonly job: AssetJob }
  /** No row was written: an empty job could never complete itself. */
  | { readonly kind: 'nothing-to-do'; readonly total: number }
  | { readonly kind: 'unavailable'; readonly error: LayerError };

export function unavailable(error: LayerError): PlanOutcome<never> {
  return { kind: 'unavailable', error };
}

/** What queueing a reading tells the lane, from the plan that queued it. */
export function enqueueOutcome(prepared: PlanOutcome<unknown>): EnqueueOutcome {
  switch (prepared.kind) {
    case 'unavailable':
      return { kind: 'unavailable', error: prepared.error };
    case 'nothing-to-do':
      return NOTHING_TO_DO;
    case 'planned':
      return remainingSentenceIds(prepared.job).length === 0 ? NOTHING_TO_DO : QUEUED;
  }
}

/** A job row's progress, as counts over a reading of `total` sentences. */
export function countsFor(total: number, job: AssetJob): LayerCounts {
  return {
    total,
    requested: job.orderedSentenceIds.length,
    completed: job.completedSentenceIds.length,
    failed: job.failedItems.length,
  };
}

/** A thrown value's kind only: never its message, which may carry content. */
function describe(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

const EMPTY_COUNTS: LayerCounts = { total: 0, requested: 0, completed: 0, failed: 0 };
const IDLE = { kind: 'idle' } as const;

/** The run a store's `process` is advancing. */
export interface ReadingJobRun {
  readonly readingId: ReadingId;
  /** Aborted by the learner's Stop. Audio also aborts it itself, to fail fast. */
  readonly controller: AbortController;
  readonly signal: AbortSignal;
}

export interface ReadingJobLifecycleOptions<Context extends { readonly total: number }, Failure> {
  readonly jobKind: AssetJobKind;
  /** The provider task a failure carried over from an earlier run is reported under. */
  readonly task: AiTask;
  /** The `kind` every diagnostic this lifecycle writes carries. */
  readonly logKind: 'translation' | 'grammar' | 'audio';
  readonly jobs: JobRepository;
  readonly logger: Logger;
  /** What a failure carries when the store has nothing of its own to add. */
  readonly failure: Failure;
  /** Resets a store's own per-run state, before anything is read. */
  readonly onStart?: () => void;
  /** Resolves configuration and the job row for a run under the current settings. */
  readonly plan: (readingId: ReadingId) => Promise<PlanOutcome<Context>>;
  /**
   * Advances a planned row that still has sentences to request, and ends by
   * reporting through `fail`, `settle`, `halt`, or `markFailed`.
   */
  readonly process: (context: Context, job: AssetJob, run: ReadingJobRun) => Promise<void>;
}

/**
 * The lifecycle the three whole-reading job stores share: one run at a time,
 * resumed from its row, parked by the lane, stopped by the learner.
 *
 * Composed into each store rather than inherited, so each store's file still
 * states its whole public surface, and this can be exercised without Angular's
 * injector. What stays in the stores is what differs: how a run is planned,
 * how its requests are batched, and what counts as a failure.
 *
 * A stop, a park, a completion, or a recorded failure is written to the row
 * before progress reports it. Stopping in particular is reported only once the
 * row says `cancelled`, so a reload after the learner saw "Stopped" can never
 * resume the run, and a run still storing what it already paid for keeps saying
 * so until it has. Two reports write nothing: a failure of storage itself, and
 * a reading that had nothing to do, which never got a row.
 *
 * Whether a run was parked along the way never changes how it ends. A
 * sentence that failed before a yield is still a hole when the resumed run
 * drains, so the job ends `failed` exactly as an uninterrupted run would; a
 * resume never asks for it again, because no job retries on its own
 * (ADR 0048) and Retry is the attempt for what is missing (ADR 0035).
 */
export class ReadingJobLifecycle<
  Context extends { readonly total: number },
  Running extends object = object,
  Failure extends object = object,
> {
  private readonly options: ReadingJobLifecycleOptions<Context, Failure>;
  private readonly progressSignal = signal<ReadingJobProgress<Running, Failure>>(IDLE);
  private controller: AbortController | null = null;
  /** The full plan/process lifetime, so destructive maintenance can join it. */
  private activeRun: Promise<void> | null = null;
  /** The row write that ends a parked run the learner stopped, until it settles. */
  private parkedClose: Promise<void> | null = null;
  private yieldFlag = false;

  readonly progress = this.progressSignal.asReadonly();

  /**
   * Whether a run is busy this instant. Scheduling asks this — yielding only
   * means something to a run that is working, and resuming must be allowed
   * while a run is parked — so a paused run is not running here.
   */
  readonly isRunning = computed(() => {
    const kind = this.progressSignal().kind;
    return kind === 'preparing' || kind === 'running';
  });

  /** What "nothing is happening" looks like, for a caller with no reading yet. */
  readonly idleProgress: ReadingJobProgress<Running, Failure> = IDLE;

  constructor(options: ReadingJobLifecycleOptions<Context, Failure>) {
    this.options = options;
  }

  /** Whether the lane has asked the current run to park at its next boundary. */
  get yieldRequested(): boolean {
    return this.yieldFlag;
  }

  progressFor(readingId: ReadingId): ReadingJobProgress<Running, Failure> {
    const progress = this.progressSignal();
    return progress.kind !== 'idle' && progress.readingId === readingId ? progress : IDLE;
  }

  /**
   * Whether this reading has a run in progress, parked or not. Asked for the
   * learner's sake — a parked run picks up on its own, so a Stop that is
   * offered stays offered and dismissing its report must not hide it.
   */
  isRunningFor(readingId: ReadingId): boolean {
    const kind = this.progressFor(readingId).kind;
    return kind === 'preparing' || kind === 'running' || kind === 'paused';
  }

  owns(readingId: ReadingId): boolean {
    const progress = this.progressSignal();
    return progress.kind !== 'idle' && progress.readingId === readingId;
  }

  /**
   * Asks this run to stop at its next boundary and stay resumable.
   *
   * Never a cancellation: `cancelled` is final to every screen watching a run,
   * and the reader seals a listening session's media source on it (ADR 0048).
   */
  yieldAfterBatch(): void {
    if (this.isRunning()) {
      this.yieldFlag = true;
    }
  }

  /**
   * Runs the reading's outstanding work under the current settings.
   *
   * Joins a run already in flight rather than racing it, so pressing the
   * action twice continues one job.
   */
  async start(readingId: ReadingId): Promise<void> {
    if (this.parkedClose !== null) {
      await this.parkedClose;
    }
    if (this.activeRun !== null) {
      await this.activeRun;
      return;
    }
    // Created before the first await, so a Stop pressed while configuration
    // is still being read stops the run rather than being ignored.
    const controller = new AbortController();
    this.controller = controller;
    // A yield is asked of the run that is working, never of the next one.
    this.yieldFlag = false;
    const run = this.run({ readingId, controller, signal: controller.signal });
    this.activeRun = run;
    try {
      await run;
    } finally {
      if (this.activeRun === run) {
        this.activeRun = null;
        this.controller = null;
      }
    }
  }

  private async run(run: ReadingJobRun): Promise<void> {
    const { readingId } = run;
    this.options.onStart?.();
    this.progressSignal.set({ kind: 'preparing', readingId });
    this.options.logger.info('job.started', { kind: this.options.logKind });
    const prepared = await this.options.plan(readingId);
    if (prepared.kind === 'unavailable') {
      this.fail(readingId, prepared.error.error, EMPTY_COUNTS);
      return;
    }
    if (prepared.kind === 'nothing-to-do') {
      this.progressSignal.set({
        kind: 'complete',
        readingId,
        counts: { ...EMPTY_COUNTS, total: prepared.total },
      });
      return;
    }
    const { context, job } = prepared;
    const counts = countsFor(context.total, job);
    // Nothing left to request — reconciling may already have closed the row
    // `complete`. A stop or a yield that arrived meanwhile has nothing to stop,
    // and writing `cancelled` over a finished layer would offer "Continue" for
    // work that is done.
    if (remainingSentenceIds(job).length === 0) {
      await this.drained(job, counts, null);
      return;
    }
    // Stopped or asked to park while the plan was being read: the row exists
    // now, so it is closed or parked before a single request is made.
    if (run.signal.aborted || this.yieldFlag) {
      await this.halt(job, counts, run);
      return;
    }
    await this.options.process(context, job, run);
  }

  /**
   * Continues an interrupted job after a reload. Does nothing when the reading
   * has no unfinished job, so opening a reader never issues a request.
   */
  async resume(readingId: ReadingId): Promise<void> {
    if (this.isRunning()) {
      return;
    }
    if (this.parkedClose !== null) {
      await this.parkedClose;
    }
    const existing = await this.options.jobs.findActive(readingId, this.options.jobKind);
    if (!existing.ok) {
      this.fail(readingId, existing.error, EMPTY_COUNTS);
      return;
    }
    if (existing.value === null) {
      if (this.owns(readingId)) {
        this.progressSignal.set(IDLE);
      }
      return;
    }
    await this.start(readingId);
  }

  /**
   * Stops this reading's run, keeping everything it already stored.
   *
   * A working run is aborted and reports `cancelled` once it has unwound and
   * its row is closed; until then it is still storing what it already paid for,
   * and says so. A parked run has nothing to abort, but its Stop is offered
   * like any other, so its row is closed here and the write is kept for
   * `start`, `resume`, and `cancelAndWait` to wait on.
   */
  cancel(readingId: ReadingId): void {
    if (!this.owns(readingId)) {
      return;
    }
    // A stop outranks a yield asked for before it: what is still in flight
    // comes back to a run that is stopped, not one to park.
    this.yieldFlag = false;
    const progress = this.progressSignal();
    if (progress.kind === 'paused') {
      if (this.parkedClose === null) {
        this.closeParked(readingId, progress.counts);
      }
      return;
    }
    this.controller?.abort();
  }

  /** Cancels and waits until no in-flight result can still be stored. */
  async cancelAndWait(readingId: ReadingId): Promise<void> {
    this.cancel(readingId);
    await this.activeRun;
    if (this.parkedClose !== null) {
      await this.parkedClose;
    }
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
   * Returns a settled run to rest, so its report leaves the screen. A run that
   * is still going, parked or not, is never hidden this way.
   */
  acknowledge(readingId: ReadingId): void {
    if (this.owns(readingId) && !this.isRunningFor(readingId)) {
      this.progressSignal.set(IDLE);
    }
  }

  /** Publishes a working run's progress. */
  publish(progress: Extract<ReadingJobProgress<Running, Failure>, { kind: 'running' }>): void {
    this.progressSignal.set(progress);
  }

  /**
   * Ends a run that stopped short: `paused` when the lane asked it to park,
   * `cancelled` otherwise. Never `cancelled` for a yield alone (ADR 0048).
   */
  async halt(job: AssetJob, counts: LayerCounts, run: ReadingJobRun): Promise<void> {
    if (!run.signal.aborted && this.yieldFlag) {
      await this.markPaused(job, counts);
    } else {
      await this.markCancelled(job, counts);
    }
  }

  /**
   * Ends a run whose work has drained, and reports what it came to.
   *
   * A stop is checked before a yield, and both before a failure: a learner who
   * pressed Stop while the run was being asked to park ended it, and a batch
   * that failed on its way to a stop is not a failure to offer a retry for.
   */
  async settle(
    job: AssetJob,
    counts: LayerCounts,
    run: ReadingJobRun,
    failure: AiError | StorageError | null,
    detail: Failure = this.options.failure,
  ): Promise<ReadingJobProgress['kind']> {
    if (run.signal.aborted || this.yieldFlag) {
      await this.halt(job, counts, run);
    } else {
      await this.drained(job, counts, failure, detail);
    }
    return this.progressSignal().kind;
  }

  /**
   * The first sentence an earlier run of this row failed and left as a hole.
   *
   * Read from the row as this run found it: nothing a resumed run does fills
   * that hole, so it decides the ending just as the original failure would
   * have. Its stored code is checked rather than trusted.
   */
  earlierFailure(job: AssetJob): AiError | null {
    const first = job.failedItems.at(0);
    if (first === undefined) {
      return null;
    }
    const code = ALL_AI_ERROR_CODES.find((candidate) => candidate === first.errorCode) ?? 'unknown';
    return aiError(code, this.options.task, 'Some sentences could not be prepared.');
  }

  /**
   * Ends a run with nothing left to request: `failed` while the row still has
   * a hole, whichever run made it, and `complete` only when it has none.
   */
  private async drained(
    job: AssetJob,
    counts: LayerCounts,
    failure: AiError | StorageError | null,
    detail: Failure = this.options.failure,
  ): Promise<void> {
    const ending = failure ?? this.earlierFailure(job);
    if (ending !== null) {
      await this.markFailed(job, ending, counts, detail);
    } else {
      await this.markComplete(job, counts);
    }
  }

  /** Closes the row as failed, then reports the failure that ended it. */
  async markFailed(
    job: AssetJob,
    error: AiError | StorageError,
    counts: LayerCounts,
    detail: Failure = this.options.failure,
  ): Promise<void> {
    const marked = await this.options.jobs.setState(job.id, 'failed');
    this.fail(job.readingId, marked.ok ? error : marked.error, counts, detail);
  }

  private async markComplete(job: AssetJob, counts: LayerCounts): Promise<void> {
    const marked = await this.options.jobs.setState(job.id, 'complete');
    if (!marked.ok) {
      this.fail(job.readingId, marked.error, counts);
      return;
    }
    this.progressSignal.set({ kind: 'complete', readingId: job.readingId, counts });
    this.options.logger.info('job.succeeded', {
      kind: this.options.logKind,
      count: counts.completed,
    });
  }

  /**
   * Reports a failure without writing the row: for a run whose storage is
   * what failed, or one that failed before it had a row.
   */
  fail(
    readingId: ReadingId,
    error: AiError | StorageError,
    counts: LayerCounts,
    detail: Failure = this.options.failure,
  ): void {
    this.progressSignal.set({
      kind: 'failed',
      readingId,
      counts,
      error:
        error.domain === 'storage' ? { source: 'storage', error } : { source: 'provider', error },
      ...detail,
    });
    this.options.logger.error('job.failed', {
      kind: this.options.logKind,
      errorDomain: error.domain,
      errorCode: error.code,
    });
  }

  /** Parks the run where it stands, keeping the row for whoever resumes it. */
  private async markPaused(job: AssetJob, counts: LayerCounts): Promise<void> {
    this.yieldFlag = false;
    const marked = await this.options.jobs.setState(job.id, 'paused');
    if (!marked.ok) {
      this.fail(job.readingId, marked.error, counts);
      return;
    }
    this.progressSignal.set({ kind: 'paused', readingId: job.readingId, counts });
    this.options.logger.info('job.paused', { kind: this.options.logKind, count: counts.completed });
  }

  /** Closes the row so nothing resumes it; a write that fails is reported, not dropped. */
  private async markCancelled(job: AssetJob, counts: LayerCounts): Promise<void> {
    const marked = await this.options.jobs.setState(job.id, 'cancelled');
    this.cancelled(job.readingId, marked.ok ? null : marked.error, counts);
  }

  private closeParked(readingId: ReadingId, counts: LayerCounts): void {
    const close = (async () => {
      const { jobs, jobKind } = this.options;
      const active = await jobs.findActive(readingId, jobKind);
      const closed =
        !active.ok || active.value === null
          ? active
          : await jobs.setState(active.value.id, 'cancelled');
      this.cancelled(readingId, closed.ok ? null : closed.error, counts);
    })()
      .catch((error: unknown) => {
        // Nobody awaits a Stop, so a write that threw rather than returning
        // its error would otherwise go unhandled. Said as storage, since a
        // row that could not be closed is exactly that.
        this.fail(
          readingId,
          storageError('unknown', 'The stopped run could not be closed.', describe(error)),
          counts,
        );
      })
      .finally(() => {
        if (this.parkedClose === close) {
          this.parkedClose = null;
        }
      });
    this.parkedClose = close;
  }

  private cancelled(readingId: ReadingId, error: StorageError | null, counts: LayerCounts): void {
    if (error !== null) {
      this.fail(readingId, error, counts);
      return;
    }
    this.progressSignal.set({ kind: 'cancelled', readingId, counts });
    this.options.logger.info('job.cancelled', {
      kind: this.options.logKind,
      count: counts.completed,
    });
  }
}
