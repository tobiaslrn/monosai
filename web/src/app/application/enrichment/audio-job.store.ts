import { Injectable, inject } from '@angular/core';
import { isAutomaticallyRetryable, type AiError } from '../../domain/ai/ai-error';
import { remainingSentenceIds, type AssetJob, type JobState } from '../../domain/enrichment/jobs';
import type { Sentence } from '../../domain/reading/text-hierarchy';
import { jobId, type ReadingId, type SentenceId } from '../../domain/shared/ids';
import type { Result } from '../../domain/shared/result';
import type { StorageError } from '../../domain/storage/storage-error';
import {
  CLOCK,
  ID_GENERATOR,
  JOB_REPOSITORY,
  READING_REPOSITORY,
} from '../shared/repository-tokens';
import { AudioConfigurationService, type ResolvedAudioConfig } from './audio-configuration.service';
import { AudioSynthesisService, speechContextFor } from './audio-synthesis.service';
import { EnrichmentKeysService } from './enrichment-keys.service';
import { PreparationPacer, backOffOnRateLimit } from './preparation-pacer';
import type { EnqueueOutcome, LayerCounts, LayerError } from './layer-progress';
import {
  ReadingJobLifecycle,
  countsFor,
  enqueueOutcome,
  unavailable,
  type PlanOutcome,
  type ReadingJobProgress,
  type ReadingJobRun,
} from './reading-job-lifecycle';
import { LOGGER, NOOP_LOGGER, type Logger } from '../shared/diagnostics';

/** Which layer refused, so the progress row can offer the right next action. */
export type AudioJobError = LayerError;

/**
 * `requested` is the sentences this job set out to read — the ones missing a
 * current clip — out of `total` in the reading.
 */
export type AudioJobCounts = LayerCounts;

/** What a failed audio run adds to the report. */
interface AudioFailure {
  /**
   * Whether running the same request again could plausibly produce a clip.
   *
   * False once repeated attempts have produced nothing: a retry that cannot
   * work still spends a request per sentence, and offering it is how a
   * learner discovers the same answer at the same price several times over.
   */
  readonly canRetry: boolean;
}

export type AudioJobProgress = ReadingJobProgress<object, AudioFailure>;

/**
 * Whether a run is in progress as the learner sees it: preparing, running, or
 * parked between batches.
 *
 * A paused run stopped to let another lane through and picks up on its own, so
 * to anyone watching it the work is still going — a Stop that is offered
 * stays offered, and a Generate that was refused stays refused. This is
 * deliberately not "a worker is busy this instant", which is what the store's
 * own scheduling asks (`isRunning`): a paused run has no worker and must be
 * allowed to resume.
 */
export function isAudioRunInProgress(progress: AudioJobProgress): boolean {
  return progress.kind === 'preparing' || progress.kind === 'running' || progress.kind === 'paused';
}

/**
 * One queue-level retry when a request returned bytes that did not validate as
 * audio. Transient transport failures already spend their complete retry budget
 * inside the provider; retrying those again here would multiply that limit.
 */
export const AUDIO_SENTENCE_RETRY_LIMIT = 1;

/**
 * How many consecutive runs may end without a new clip before Try again stops
 * being offered.
 *
 * Two, so a passing outage costs one more attempt and no more: a second run
 * that also produced nothing is evidence that this reading has sentences this
 * configuration cannot read, not that the network was briefly away.
 */
export const AUDIO_FRUITLESS_RUN_LIMIT = 2;

/** Reads the flag through a call, so an earlier check never narrows a later one. */
function isAborted(signal: AbortSignal): boolean {
  return signal.aborted;
}

/** The one refusal that stops a run, whichever worker met it first. */
type TerminalFailure =
  | { readonly source: 'provider'; readonly sentenceId: SentenceId; readonly error: AiError }
  | { readonly source: 'storage'; readonly error: StorageError };

/** Runs for one reading that stored nothing, and the voice they were made for. */
interface FruitlessRuns {
  readonly runs: number;
  readonly configFingerprint: string;
}

/**
 * Which sentences a newly created job covers.
 *
 * `current-configuration` is what *Prepare audio* asks; `never-prepared` is
 * what the lane queues, so changing the voice queues nothing.
 */
type JobScope = 'current-configuration' | 'never-prepared';

/** Everything one run needs, captured once so no setting can change mid-flight. */
interface JobContext {
  readonly readingId: ReadingId;
  readonly config: ResolvedAudioConfig;
  readonly cacheKeys: ReadonlyMap<SentenceId, string>;
  readonly orderedSentenceIds: readonly SentenceId[];
  readonly total: number;
}

/**
 * The whole-reading audio preparation job.
 *
 * The same machine as `TranslationJobStore`, with two differences the
 * specification insists on. Sentences take their turn from the shared
 * `PreparationPacer` at their own reading position, so the beginning of the
 * reading is always the part that exists first and playback can start against a
 * prefix while the rest is still arriving (ADR 0034) — now interleaved with the
 * English and grammar for those same sentences rather than waiting for both
 * (ADR 0059). Sentence-local failures are
 * retried or recorded without abandoning later work, and a job with a hole is
 * reported as failed rather than falsely complete. Configuration-wide and
 * storage failures still stop the workers immediately (ADR 0035).
 *
 * A sentence whose returned clip is invalid gets one queue-level retry.
 * Exhausted sentence-local failures are recorded while the queue continues;
 * configuration-wide failures still stop the run immediately so a bad key or
 * model cannot spend one request per sentence. **Try again** remains the
 * visible attempt for the missing clips.
 *
 * That retry is itself bounded. A sentence this voice cannot read fails the
 * same way every run, so a settled failure reports whether running it again
 * could plausibly produce anything: after `AUDIO_FRUITLESS_RUN_LIMIT` runs that
 * stored no clip, it says no, and the reader stops offering a retry whose only
 * result is another request per missing sentence.
 */
@Injectable({ providedIn: 'root' })
export class AudioJobStore {
  private readonly readings = inject(READING_REPOSITORY);
  private readonly jobs = inject(JOB_REPOSITORY);
  private readonly audio = inject(AudioSynthesisService);
  private readonly pacer = inject(PreparationPacer);
  private readonly audioConfig = inject(AudioConfigurationService);
  private readonly keys = inject(EnrichmentKeysService);
  private readonly clock = inject(CLOCK);
  private readonly ids = inject(ID_GENERATOR);
  private readonly logger = inject<Logger>(LOGGER, { optional: true }) ?? NOOP_LOGGER;

  /**
   * Consecutive runs that stored no clip, per reading and configuration.
   *
   * Per reading rather than one counter, so a learner moving between two
   * readings does not clear the evidence that one of them cannot be finished;
   * and per configuration, because a different voice is a different question
   * and deserves its own attempts. An entry lives as long as the session and is
   * dropped as soon as a run produces something or the reading goes.
   */
  private readonly fruitlessRuns = new Map<ReadingId, FruitlessRuns>();

  /**
   * A failure the store reports without evidence of its own — a refused plan,
   * an unreadable row — says nothing about whether the voice can read this
   * reading, so the retry stays offered.
   */
  private readonly lifecycle = new ReadingJobLifecycle<JobContext, object, AudioFailure>({
    jobKind: 'prepare-audio',
    task: 'tts-synthesis',
    logKind: 'audio',
    jobs: this.jobs,
    logger: this.logger,
    failure: { canRetry: true },
    plan: (readingId) => this.plan(readingId, 'current-configuration', 'running'),
    process: (context, job, run) => this.process(context, job, run),
  });

  readonly progress = this.lifecycle.progress;

  /**
   * Whether a worker is busy this instant. Scheduling asks this — yielding only
   * means something to a run that has workers, and resuming must be allowed
   * while a run is parked — so a paused run is not running here. What a learner
   * sees as "still going" is `isAudioRunInProgress`.
   */
  readonly isRunning = this.lifecycle.isRunning;

  /** What "nothing is happening" looks like, for a caller with no reading yet. */
  readonly idleProgress = this.lifecycle.idleProgress;

  progressFor(readingId: ReadingId): AudioJobProgress {
    return this.lifecycle.progressFor(readingId);
  }

  /**
   * Whether this reading has a run in progress, parked or not. Asked for the
   * learner's sake — the delete confirmation names it, and dismissing a report
   * must not hide a run that will resume — so a paused run counts.
   */
  isRunningFor(readingId: ReadingId): boolean {
    return this.lifecycle.isRunningFor(readingId);
  }

  /**
   * Queues this reading without issuing a single request. The row covers the
   * sentences with no clip at all, so changing the voice queues nothing.
   */
  async enqueue(readingId: ReadingId): Promise<EnqueueOutcome> {
    return enqueueOutcome(await this.plan(readingId, 'never-prepared', 'queued'));
  }

  /**
   * Asks this run to stop once its workers finish what they are holding.
   *
   * Never a cancellation. Under ADR 0045 the reader seals its media source the
   * moment an audio run reports `cancelled`, which would end a screen-locked
   * listening session; a lane handing over must not do that to a reading
   * somebody is listening to.
   */
  yieldAfterBatch(): void {
    this.lifecycle.yieldAfterBatch();
  }

  /**
   * Reads everything in the reading that has no clip under the current voice.
   *
   * Reuses an active job whose configuration still matches, so pressing the
   * action twice continues one job rather than racing two.
   */
  start(readingId: ReadingId): Promise<void> {
    return this.lifecycle.start(readingId);
  }

  /**
   * Continues an interrupted job after a reload. Does nothing when the reading
   * has no unfinished job, so opening a reader never issues a request.
   */
  resume(readingId: ReadingId): Promise<void> {
    return this.lifecycle.resume(readingId);
  }

  /** Starts a fresh bounded attempt over whatever is still missing. */
  retry(readingId: ReadingId): Promise<void> {
    return this.lifecycle.start(readingId);
  }

  /**
   * Stops scheduling further sentences and aborts the ones in flight.
   *
   * Clips already stored stay stored. They cost money, they are exactly as
   * playable individually as they were, and discarding them would be a worse
   * answer to "stop" than keeping them — and the prefix they form stays
   * playable, because playback no longer waits for a complete set (ADR 0034).
   *
   * This never stops a sound. Generation and playback are separate sessions,
   * and stopping the one that is spending money must not silence the one that
   * is not.
   */
  cancel(readingId: ReadingId): void {
    this.lifecycle.cancel(readingId);
  }

  /** Cancels and waits until no in-flight result can still be stored. */
  cancelAndWait(readingId: ReadingId): Promise<void> {
    return this.lifecycle.cancelAndWait(readingId);
  }

  /** Finalizes a reading's run before its persisted rows are removed. */
  readingDeleted(readingId: ReadingId): Promise<void> {
    // Whatever this reading could not be read aloud goes with it, whether or
    // not it is the reading whose run is currently published.
    this.fruitlessRuns.delete(readingId);
    return this.lifecycle.readingDeleted(readingId);
  }

  /**
   * Returns a settled job to rest, so its report leaves the reader.
   *
   * Only ever called for a run that has finished, been stopped, or failed:
   * dismissing the report of a run that is still scheduling requests would hide
   * work that is still spending them.
   */
  acknowledge(readingId: ReadingId): void {
    this.lifecycle.acknowledge(readingId);
  }

  /**
   * Resolves configuration, keys, and the job row this run will advance.
   *
   * A stored job whose `configFingerprint` no longer matches is closed rather
   * than resumed: its remaining sentences were chosen for a voice that is no
   * longer configured, and continuing it would report two voices' clips under
   * one progress number.
   */
  private async plan(
    readingId: ReadingId,
    scope: JobScope,
    initialState: JobState,
  ): Promise<PlanOutcome<JobContext>> {
    const config = this.audioConfig.resolve('tts-synthesis');
    if (!config.ok) {
      return unavailable({ source: 'provider', error: config.error });
    }

    const refs = await this.readings.listSentenceRefs(readingId);
    if (!refs.ok) {
      return unavailable({ source: 'storage', error: refs.error });
    }

    const context: JobContext = {
      readingId,
      config: config.value,
      cacheKeys: this.keys.audioKeys(
        refs.value,
        config.value.modelId,
        config.value.voiceId,
        config.value.optionsFingerprint,
        config.value.speechInstructions,
      ),
      total: refs.value.length,
      orderedSentenceIds: refs.value.map((ref) => ref.id),
    };

    const active = await this.jobs.findActive(readingId, 'prepare-audio');
    if (!active.ok) {
      return unavailable({ source: 'storage', error: active.error });
    }

    if (
      active.value !== null &&
      active.value.configFingerprint === config.value.configFingerprint
    ) {
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
        ? await this.audio.neverPreparedSentenceIds(context.cacheKeys)
        : await this.audio.missingSentenceIds(context.readingId, context.cacheKeys);
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

  /** Re-derives completion from stored clips, so a reload never over-reports. */
  private async reconcile(
    context: JobContext,
    job: AssetJob,
  ): Promise<Result<AssetJob, StorageError>> {
    const missing = await this.audio.missingSentenceIds(context.readingId, context.cacheKeys);
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
      kind: 'prepare-audio',
      readingId: context.readingId,
      state,
      orderedSentenceIds,
      completedSentenceIds: [],
      failedItems: [],
      configFingerprint: context.config.configFingerprint,
      createdAt: now,
      updatedAt: now,
    });
  }

  /**
   * Synthesizes the job's outstanding sentences through a bounded worker queue.
   *
   * Workers take the earliest available sentence from a shared priority queue.
   * A retryable invalid clip is reinserted at that sentence's reading position,
   * so it cannot fall behind later pending work merely because its request
   * settled first. Each clip is stored and its job item recorded before that
   * worker claims another, so an interruption leaves progress its rows support.
   *
   * Completions therefore arrive out of order. `completed` is counted here
   * rather than read from whichever `recordCompletion` happened to settle last,
   * because two overlapping transactions can resolve in either order and the
   * progress number must never go backwards.
   */
  private async process(context: JobContext, job: AssetJob, run: ReadingJobRun): Promise<void> {
    const { controller, signal } = run;
    const outstanding = remainingSentenceIds(job);
    let counts = countsFor(context.total, job);

    const loaded = await this.readings.loadSentences(context.orderedSentenceIds);
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

    const publish = (): void => {
      this.lifecycle.publish({ kind: 'running', readingId: context.readingId, counts });
    };
    publish();

    const outstandingSet = new Set(outstanding);
    const allSentences = orderedByReading(loaded.value);
    const wanted = allSentences.filter((sentence) => outstandingSet.has(sentence.id));

    let completed = counts.completed;
    // What *this* run stored, as against everything the job has ever covered.
    // Whether Try again can still do anything is a question about the run, and
    // `completed` carries an earlier run's clips into a run that stored none.
    let added = 0;
    let failed = counts.failed;
    // A holder rather than a `let`, so the flag a worker sets is still visible
    // to the checker after the queue has been awaited.
    const outcome: {
      failure: TerminalFailure | null;
      firstSentenceFailure: { readonly error: AiError } | null;
    } = { failure: null, firstSentenceFailure: null };

    /**
     * Stops the whole run for a configuration-wide or storage failure.
     *
     * Aborting the controller is what makes it fail *fast*: the requests the
     * Other workers already in flight are cancelled rather than paid for, and
     * only the first terminal failure is reported. Sentence-local failures do
     * not come through this path; they are persisted while the queue continues.
     */
    const failFast = (failure: TerminalFailure): void => {
      outcome.failure ??= failure;
      controller.abort();
    };

    const recordSentenceFailure = async (
      sentenceId: SentenceId,
      error: AiError,
    ): Promise<boolean> => {
      const recorded = await this.jobs.recordFailure(job.id, {
        sentenceId,
        errorCode: error.code,
        failedAt: this.clock.now(),
      });
      if (!recorded.ok) {
        failFast({ source: 'storage', error: recorded.error });
        return false;
      }
      outcome.firstSentenceFailure ??= { error };
      failed = recorded.value.failedItems.length;
      counts = { ...counts, failed };
      publish();
      return true;
    };

    /**
     * One sentence, from its turn in the queue to its clip on disk.
     *
     * Reading order is the pacer's, not this job's: asking for a permit at the
     * sentence's own position is what keeps the beginning of the reading the
     * part that exists first (ADR 0034), and what interleaves clips with the
     * English and grammar for the same sentences instead of waiting for both.
     *
     * A clip that came back invalid is re-requested by calling this again, so
     * the retry queues at the sentence's original position rather than behind
     * the rest of a long reading.
     */
    const readSentence = async (sentence: Sentence, failures = 0): Promise<void> => {
      const cacheKey = context.cacheKeys.get(sentence.id);
      if (cacheKey === undefined) {
        failFast({ source: 'storage', error: missingCacheKeyError(sentence.id) });
        return;
      }

      let permit;
      try {
        permit = await this.pacer.acquire(sentence.positionInReading, 'audio', signal);
      } catch {
        // Cancelled while still queued: nothing was requested for this sentence.
        return;
      }
      let produced;
      try {
        // Checked here rather than before the permit: a sentence can wait a
        // long time for its turn, and what stopped the run may have happened
        // while it did.
        if (outcome.failure !== null || isAborted(signal) || this.lifecycle.yieldRequested) {
          return;
        }
        produced = await this.audio.run(
          sentence,
          context.readingId,
          cacheKey,
          context.config,
          signal,
          speechContextFor(sentence, allSentences),
        );
      } finally {
        permit.release();
      }

      if (!produced.ok) {
        // Cancelling — the learner's Stop, or another sentence's fail-fast —
        // aborts the request already in flight, and that arrives here as a
        // refusal. Reporting it as a failure would offer a Retry for something
        // that was stopped on purpose, so the signal decides which of the two
        // this is.
        if (isAborted(signal)) {
          return;
        }
        backOffOnRateLimit(this.pacer, produced.error);
        if (shouldRetryQueueItem(produced.error) && failures < AUDIO_SENTENCE_RETRY_LIMIT) {
          await readSentence(sentence, failures + 1);
          return;
        }
        if (isSentenceLocalFailure(produced.error)) {
          await recordSentenceFailure(sentence.id, produced.error);
          return;
        }
        failFast({ source: 'provider', sentenceId: sentence.id, error: produced.error });
        return;
      }
      // A clip that did arrive is stored even when the run has been stopped
      // since: it has already been paid for, and it is exactly as playable on
      // its own as it would have been.

      const stored = await this.audio.store(produced.value, context.cacheKeys);
      if (!stored.ok) {
        failFast({ source: 'storage', error: stored.error });
        return;
      }
      const advanced = await this.jobs.recordCompletion(job.id, sentence.id);
      if (!advanced.ok) {
        failFast({ source: 'storage', error: advanced.error });
        return;
      }
      completed += 1;
      added += 1;
      counts = { ...counts, completed };
      publish();
    };

    await Promise.all(wanted.map((sentence) => readSentence(sentence)));

    // The failure wins over the abort it caused, so a run that stopped because
    // a request was refused is never reported as one the learner stopped.
    const failure = outcome.failure;
    if (failure !== null) {
      const canRetry = this.noteRunOutcome(
        context.readingId,
        context.config.configFingerprint,
        added,
      );
      if (failure.source === 'storage') {
        this.lifecycle.fail(context.readingId, failure.error, counts, { canRetry });
        return;
      }
      await this.stopAtFailure(job, failure.sentenceId, failure.error, counts, canRetry);
      return;
    }

    // A hole an earlier run left before it was parked counts as this run's own:
    // a job with a hole is reported as failed, however many runs it took.
    const sentenceFailure =
      outcome.firstSentenceFailure?.error ?? this.lifecycle.earlierFailure(job);
    let canRetry = true;
    if (isAborted(signal) || this.lifecycle.yieldRequested) {
      // A run that was stopped or parked is not evidence of anything: stopping
      // early is a choice rather than a refusal, so it never counts towards the
      // fruitless streak — but clips it did produce still clear one, because a
      // configuration that produced something is working.
      if (added > 0) {
        this.fruitlessRuns.delete(context.readingId);
      }
    } else if (sentenceFailure !== null) {
      canRetry = this.noteRunOutcome(context.readingId, context.config.configFingerprint, added);
    } else {
      this.fruitlessRuns.delete(context.readingId);
    }
    await this.lifecycle.settle(job, counts, run, sentenceFailure, { canRetry });
  }

  private async stopAtFailure(
    job: AssetJob,
    sentenceId: SentenceId,
    error: AiError,
    counts: AudioJobCounts,
    canRetry: boolean,
  ): Promise<void> {
    const recorded = await this.jobs.recordFailure(job.id, {
      sentenceId,
      errorCode: error.code,
      failedAt: this.clock.now(),
    });
    if (!recorded.ok) {
      this.lifecycle.fail(job.readingId, recorded.error, counts, { canRetry });
      return;
    }
    const withFailure = { ...counts, failed: recorded.value.failedItems.length };
    await this.lifecycle.markFailed(job, error, withFailure, { canRetry });
  }

  /**
   * Records what a settled run produced, and answers whether offering to run it
   * again is honest.
   *
   * A run that stored nothing new is one piece of evidence — a passing outage
   * looks exactly the same — so it takes `AUDIO_FRUITLESS_RUN_LIMIT` of them in
   * a row before the offer is withdrawn. Anything stored clears the count: work
   * is being done, whatever else failed.
   */
  private noteRunOutcome(readingId: ReadingId, configFingerprint: string, added: number): boolean {
    if (added > 0) {
      this.fruitlessRuns.delete(readingId);
      return true;
    }
    const recorded = this.fruitlessRuns.get(readingId);
    const runs = (recorded?.configFingerprint === configFingerprint ? recorded.runs : 0) + 1;
    this.fruitlessRuns.set(readingId, { runs, configFingerprint });
    return runs < AUDIO_FRUITLESS_RUN_LIMIT;
  }
}

/**
 * Reading order, asserted here rather than assumed of the repository.
 *
 * "Claimed in reading order" is a rule of this job, and a rule that depends on
 * another layer's incidental ordering is a rule that breaks quietly.
 */
function orderedByReading(sentences: readonly Sentence[]): readonly Sentence[] {
  return [...sentences].sort((left, right) => left.positionInReading - right.positionInReading);
}

/** Failures that can be specific to one sentence rather than the whole setup. */
function isSentenceLocalFailure(error: AiError): boolean {
  return (
    isAutomaticallyRetryable(error) ||
    error.code === 'malformed-response' ||
    error.code === 'audio-invalid'
  );
}

function shouldRetryQueueItem(error: AiError): boolean {
  return error.code === 'audio-invalid';
}

function missingCacheKeyError(sentenceId: SentenceId): StorageError {
  return {
    domain: 'storage',
    code: 'corrupt-record',
    message: `The audio cache key for sentence ${sentenceId} was missing.`,
  };
}
