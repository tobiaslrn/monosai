import { Injectable, computed, inject, signal } from '@angular/core';
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
import { NOTHING_TO_DO, QUEUED, type EnqueueOutcome, type LayerError } from './layer-progress';
import { LOGGER, NOOP_LOGGER, type Logger } from '../shared/diagnostics';

/** Which layer refused, so the progress row can offer the right next action. */
export type AudioJobError =
  | { readonly source: 'provider'; readonly error: AiError }
  | { readonly source: 'storage'; readonly error: StorageError };

export interface AudioJobCounts {
  /** Sentences in the reading, with a clip or not. */
  readonly total: number;
  /** Sentences this job set out to read — the ones missing a current clip. */
  readonly requested: number;
  readonly completed: number;
  readonly failed: number;
}

export type AudioJobProgress =
  | { readonly kind: 'idle' }
  | { readonly kind: 'preparing'; readonly readingId: ReadingId }
  | { readonly kind: 'running'; readonly readingId: ReadingId; readonly counts: AudioJobCounts }
  | { readonly kind: 'complete'; readonly readingId: ReadingId; readonly counts: AudioJobCounts }
  | { readonly kind: 'cancelled'; readonly readingId: ReadingId; readonly counts: AudioJobCounts }
  | { readonly kind: 'paused'; readonly readingId: ReadingId; readonly counts: AudioJobCounts }
  | { readonly kind: 'deleted'; readonly readingId: ReadingId }
  | {
      readonly kind: 'failed';
      readonly readingId: ReadingId;
      readonly counts: AudioJobCounts;
      readonly error: AudioJobError;
      /**
       * Whether running the same request again could plausibly produce a clip.
       *
       * False once repeated attempts have produced nothing: a retry that cannot
       * work still spends a request per sentence, and offering it is how a
       * learner discovers the same answer at the same price several times over.
       */
      readonly canRetry: boolean;
    };

const IDLE: AudioJobProgress = { kind: 'idle' };

/**
 * How many synthesis requests this job keeps in flight.
 *
 * Four rather than one because a learner waiting for a twenty-sentence reading
 * waits four times as long for no benefit, and four rather than more because
 * the point of a bound is that the beginning of the reading still arrives
 * first: a wide queue would spread the first completions across the reading and
 * leave progressive playback with nothing to start on (ADR 0034).
 */
export const AUDIO_GENERATION_CONCURRENCY = 4;

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

interface AudioQueueItem {
  readonly sentence: Sentence;
  /** Number of provider refusals already received for this sentence. */
  readonly failures: number;
}

/**
 * A small stable priority queue keyed by reading position.
 *
 * Retried sentences are inserted back at their original priority, so an early
 * sentence cannot fall behind the rest of a long reading merely because its
 * invalid clip happened to return first.
 */
class AudioPriorityQueue {
  private readonly items: AudioQueueItem[];

  constructor(sentences: readonly Sentence[]) {
    this.items = orderedByReading(sentences).map((sentence) => ({ sentence, failures: 0 }));
  }

  get length(): number {
    return this.items.length;
  }

  take(): AudioQueueItem | null {
    return this.items.shift() ?? null;
  }

  retry(item: AudioQueueItem): void {
    const retried = { ...item, failures: item.failures + 1 };
    const nextLaterSentence = this.items.findIndex(
      (candidate) => candidate.sentence.positionInReading > retried.sentence.positionInReading,
    );
    if (nextLaterSentence < 0) {
      this.items.push(retried);
      return;
    }
    this.items.splice(nextLaterSentence, 0, retried);
  }
}

/** Runs for one reading that stored nothing, and the voice they were made for. */
interface FruitlessRuns {
  readonly runs: number;
  readonly configFingerprint: string;
}

/** Everything one run needs, captured once so no setting can change mid-flight. */
/**
 * Which sentences a newly created job covers.
 *
 * `current-configuration` is what *Prepare audio* asks; `never-prepared` is
 * what the lane queues, so changing the voice queues nothing.
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
  readonly config: ResolvedAudioConfig;
  readonly cacheKeys: ReadonlyMap<SentenceId, string>;
  readonly orderedSentenceIds: readonly SentenceId[];
  readonly total: number;
}

/**
 * The whole-reading audio preparation job.
 *
 * The same machine as `TranslationJobStore`, with two differences the
 * specification insists on. Sentences are **claimed in reading order by at most
 * `AUDIO_GENERATION_CONCURRENCY` workers**, so the beginning of the reading is
 * always the part that exists first and playback can start against a prefix
 * while the rest is still arriving (ADR 0034). Sentence-local failures are
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
  private readonly audioConfig = inject(AudioConfigurationService);
  private readonly keys = inject(EnrichmentKeysService);
  private readonly clock = inject(CLOCK);
  private readonly ids = inject(ID_GENERATOR);
  private readonly logger = inject<Logger>(LOGGER, { optional: true }) ?? NOOP_LOGGER;

  private readonly progressSignal = signal<AudioJobProgress>(IDLE);
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
  private controller: AbortController | null = null;
  private yieldRequested = false;
  /** The full prepare/process lifetime, so destructive maintenance can join it. */
  private activeRun: Promise<void> | null = null;

  readonly progress = this.progressSignal.asReadonly();

  readonly isRunning = computed(() => {
    const kind = this.progressSignal().kind;
    return kind === 'preparing' || kind === 'running';
  });

  progressFor(readingId: ReadingId): AudioJobProgress {
    const progress = this.progressSignal();
    return progress.kind !== 'idle' && progress.readingId === readingId ? progress : IDLE;
  }

  isRunningFor(readingId: ReadingId): boolean {
    const kind = this.progressFor(readingId).kind;
    return kind === 'preparing' || kind === 'running';
  }

  /**
   * Queues this reading without issuing a single request. The row covers the
   * sentences with no clip at all, so changing the voice queues nothing.
   */
  async enqueue(readingId: ReadingId): Promise<EnqueueOutcome> {
    const prepared = await this.plan(readingId, 'never-prepared', 'queued');
    if (prepared.kind !== 'planned') {
      return prepared.kind === 'nothing-to-do' ? NOTHING_TO_DO : prepared.outcome;
    }
    return remainingSentenceIds(prepared.job).length === 0 ? NOTHING_TO_DO : QUEUED;
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
    if (this.isRunning()) {
      this.yieldRequested = true;
    }
  }

  /**
   * Reads everything in the reading that has no clip under the current voice.
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
    this.logger.info('job.started', { kind: 'audio' });
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
    await this.process(prepared.context, prepared.job, controller);
  }

  /**
   * Continues an interrupted job after a reload. Does nothing when the reading
   * has no unfinished job, so opening a reader never issues a request.
   */
  async resume(readingId: ReadingId): Promise<void> {
    if (this.isRunning()) {
      return;
    }
    const existing = await this.jobs.findActive(readingId, 'prepare-audio');
    if (!existing.ok) {
      this.failStorage(readingId, existing.error, emptyCounts(), true);
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
    if (!this.owns(readingId)) {
      return;
    }
    this.controller?.abort();
    this.controller = null;
    const progress = this.progressSignal();
    if (progress.kind === 'preparing') {
      this.progressSignal.set({ kind: 'cancelled', readingId, counts: emptyCounts() });
    } else if (progress.kind === 'running') {
      this.progressSignal.set({ kind: 'cancelled', readingId, counts: progress.counts });
    }
  }

  /** Cancels and waits until no in-flight result can still be stored. */
  async cancelAndWait(readingId: ReadingId): Promise<void> {
    this.cancel(readingId);
    await this.activeRun;
  }

  /** Finalizes a reading's run before its persisted rows are removed. */
  async readingDeleted(readingId: ReadingId): Promise<void> {
    // Whatever this reading could not be read aloud goes with it, whether or
    // not it is the reading whose run is currently published.
    this.fruitlessRuns.delete(readingId);
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
   * dismissing the report of a run that is still scheduling requests would hide
   * work that is still spending them.
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
   * than resumed: its remaining sentences were chosen for a voice that is no
   * longer configured, and continuing it would report two voices' clips under
   * one progress number.
   */
  private async plan(
    readingId: ReadingId,
    scope: JobScope,
    initialState: JobState,
  ): Promise<PlanOutcome> {
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
      return { kind: 'nothing-to-do', context };
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
  private async process(
    context: JobContext,
    job: AssetJob,
    controller: AbortController,
  ): Promise<void> {
    const signal = controller.signal;
    const outstanding = remainingSentenceIds(job);
    let counts: AudioJobCounts = {
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

    const loaded = await this.readings.loadSentences(context.orderedSentenceIds);
    if (!loaded.ok) {
      this.failStorage(context.readingId, loaded.error, counts, true);
      return;
    }

    if (job.state !== 'running') {
      const started = await this.jobs.setState(job.id, 'running');
      if (!started.ok) {
        this.failStorage(context.readingId, started.error, counts, true);
        return;
      }
    }

    this.progressSignal.set({ kind: 'running', readingId: context.readingId, counts });

    const outstandingSet = new Set(outstanding);
    const allSentences = orderedByReading(loaded.value);
    const queue = new AudioPriorityQueue(
      allSentences.filter((sentence) => outstandingSet.has(sentence.id)),
    );

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
      this.progressSignal.set({ kind: 'running', readingId: context.readingId, counts });
      return true;
    };

    const worker = async (): Promise<void> => {
      while (outcome.failure === null && !isAborted(signal) && !this.yieldRequested) {
        const item = queue.take();
        if (item === null) {
          return;
        }
        const sentence = item.sentence;
        const cacheKey = context.cacheKeys.get(sentence.id);
        if (cacheKey === undefined) {
          failFast({
            source: 'storage',
            error: missingCacheKeyError(sentence.id),
          });
          return;
        }

        const produced = await this.audio.run(
          sentence,
          context.readingId,
          cacheKey,
          context.config,
          signal,
          speechContextFor(sentence, allSentences),
        );
        if (!produced.ok) {
          // Cancelling — the learner's Stop, or another worker's fail-fast —
          // aborts the request already in flight, and that arrives here as a
          // refusal. Reporting it as a failure would offer a Retry for
          // something that was stopped on purpose, so the signal decides which
          // of the two this is.
          if (isAborted(signal)) {
            return;
          }
          if (shouldRetryQueueItem(produced.error) && item.failures < AUDIO_SENTENCE_RETRY_LIMIT) {
            queue.retry(item);
            continue;
          }
          if (isSentenceLocalFailure(produced.error)) {
            if (!(await recordSentenceFailure(sentence.id, produced.error))) {
              return;
            }
            continue;
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
        this.progressSignal.set({ kind: 'running', readingId: context.readingId, counts });
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(AUDIO_GENERATION_CONCURRENCY, queue.length) }, () => worker()),
    );

    // The failure wins over the abort it caused, so a run that stopped because
    // a request was refused is never reported as one the learner stopped.
    const failure = outcome.failure;
    if (failure !== null) {
      if (failure.source === 'storage') {
        this.failStorage(
          context.readingId,
          failure.error,
          counts,
          this.noteRunOutcome(context.readingId, context.config.configFingerprint, added),
        );
        return;
      }
      await this.stopAtFailure(job, failure.sentenceId, failure.error, counts, added);
      return;
    }
    if (this.yieldRequested) {
      await this.markPaused(job, counts, added);
      return;
    }
    if (isAborted(signal)) {
      await this.markCancelled(job, counts, added);
      return;
    }

    if (outcome.firstSentenceFailure !== null) {
      const canRetry = this.noteRunOutcome(
        context.readingId,
        context.config.configFingerprint,
        added,
      );
      const marked = await this.jobs.setState(job.id, 'failed');
      if (!marked.ok) {
        this.failStorage(context.readingId, marked.error, counts, canRetry);
        return;
      }
      this.failProvider(context.readingId, outcome.firstSentenceFailure.error, counts, canRetry);
      return;
    }

    this.controller = null;
    this.fruitlessRuns.delete(context.readingId);
    this.progressSignal.set({ kind: 'complete', readingId: context.readingId, counts });
    this.logger.info('job.succeeded', { kind: 'audio', count: counts.completed });
  }

  private async stopAtFailure(
    job: AssetJob,
    sentenceId: SentenceId,
    error: AiError,
    counts: AudioJobCounts,
    added: number,
  ): Promise<void> {
    const canRetry = this.noteRunOutcome(job.readingId, job.configFingerprint, added);
    const recorded = await this.jobs.recordFailure(job.id, {
      sentenceId,
      errorCode: error.code,
      failedAt: this.clock.now(),
    });
    if (!recorded.ok) {
      this.failStorage(job.readingId, recorded.error, counts, canRetry);
      return;
    }
    const withFailure = { ...counts, failed: recorded.value.failedItems.length };
    const marked = await this.jobs.setState(job.id, 'failed');
    if (!marked.ok) {
      this.failStorage(job.readingId, marked.error, withFailure, canRetry);
      return;
    }
    this.failProvider(job.readingId, error, withFailure, canRetry);
  }

  /**
   * Parks the run where it stands, keeping the row for whoever resumes it.
   *
   * Clips this run produced still clear the fruitless streak, for the same
   * reason a stopped run's do: a configuration that produced something is
   * working, whatever made the run stop.
   */
  private async markPaused(job: AssetJob, counts: AudioJobCounts, added: number): Promise<void> {
    this.yieldRequested = false;
    this.controller = null;
    if (added > 0) {
      this.fruitlessRuns.delete(job.readingId);
    }
    await this.jobs.setState(job.id, 'paused');
    this.progressSignal.set({ kind: 'paused', readingId: job.readingId, counts });
    this.logger.info('job.paused', { kind: 'audio', count: counts.completed });
  }

  private report(readingId: ReadingId, error: LayerError): void {
    if (error.source === 'provider') {
      this.failProvider(readingId, error.error, emptyCounts(), true);
    } else {
      this.failStorage(readingId, error.error, emptyCounts(), true);
    }
  }

  /**
   * A run the learner stopped, which is not evidence of anything.
   *
   * Stopping early is a choice rather than a refusal, so it never counts
   * towards the fruitless streak — but clips it did produce still clear one,
   * because a configuration that produced something is working.
   */
  private async markCancelled(job: AssetJob, counts: AudioJobCounts, added: number): Promise<void> {
    this.controller = null;
    if (added > 0) {
      this.fruitlessRuns.delete(job.readingId);
    }
    await this.jobs.setState(job.id, 'cancelled');
    this.progressSignal.set({ kind: 'cancelled', readingId: job.readingId, counts });
    this.logger.info('job.cancelled', { kind: 'audio', count: counts.completed });
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

  private failProvider(
    readingId: ReadingId,
    error: AiError,
    counts: AudioJobCounts,
    canRetry: boolean,
  ): void {
    this.controller = null;
    this.progressSignal.set({
      kind: 'failed',
      readingId,
      counts,
      error: { source: 'provider', error },
      canRetry,
    });
    this.logger.error('job.failed', {
      kind: 'audio',
      errorDomain: error.domain,
      errorCode: error.code,
    });
  }

  private failStorage(
    readingId: ReadingId,
    error: StorageError,
    counts: AudioJobCounts,
    canRetry: boolean,
  ): void {
    this.controller = null;
    this.progressSignal.set({
      kind: 'failed',
      readingId,
      counts,
      error: { source: 'storage', error },
      canRetry,
    });
    this.logger.error('job.failed', {
      kind: 'audio',
      errorDomain: error.domain,
      errorCode: error.code,
    });
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

function emptyCounts(): AudioJobCounts {
  return { total: 0, requested: 0, completed: 0, failed: 0 };
}
