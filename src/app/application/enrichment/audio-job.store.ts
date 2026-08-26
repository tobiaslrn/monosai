import { Injectable, computed, effect, inject, signal } from '@angular/core';
import type { AiError } from '../../domain/ai/ai-error';
import { remainingSentenceIds, type AssetJob } from '../../domain/enrichment/jobs';
import type { Sentence } from '../../domain/reading/text-hierarchy';
import { jobId, type ReadingId, type SentenceId } from '../../domain/shared/ids';
import type { StorageError } from '../../domain/storage/storage-error';
import {
  CLOCK,
  ID_GENERATOR,
  JOB_REPOSITORY,
  READING_REPOSITORY,
} from '../shared/repository-tokens';
import { AppBusyRegistry } from '../shared/app-busy.registry';
import { AudioConfigurationService, type ResolvedAudioConfig } from './audio-configuration.service';
import { AudioSynthesisService, speechContextFor } from './audio-synthesis.service';
import { EnrichmentKeysService } from './enrichment-keys.service';
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
  | { readonly kind: 'preparing' }
  | { readonly kind: 'running'; readonly counts: AudioJobCounts }
  | { readonly kind: 'complete'; readonly counts: AudioJobCounts }
  | { readonly kind: 'cancelled'; readonly counts: AudioJobCounts }
  | {
      readonly kind: 'failed';
      readonly counts: AudioJobCounts;
      readonly error: AudioJobError;
    };

const IDLE: AudioJobProgress = { kind: 'idle' };

/**
 * How many synthesis requests this job keeps in flight.
 *
 * Four rather than one because a learner waiting for a twenty-sentence reading
 * waits four times as long for no benefit, and four rather than more because
 * the point of a bound is that the beginning of the reading still arrives
 * first: a wide queue would spread the first completions across the reading and
 * leave progressive playback with nothing to start on (ADR 0033).
 */
export const AUDIO_GENERATION_CONCURRENCY = 4;

/** Reads the flag through a call, so an earlier check never narrows a later one. */
function isAborted(signal: AbortSignal): boolean {
  return signal.aborted;
}

/** The one refusal that stops a run, whichever worker met it first. */
type TerminalFailure =
  | { readonly source: 'provider'; readonly sentenceId: SentenceId; readonly error: AiError }
  | { readonly source: 'storage'; readonly error: StorageError };

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
 * specification insists on. Sentences are **claimed in reading order by at most
 * `AUDIO_GENERATION_CONCURRENCY` workers**, so the beginning of the reading is
 * always the part that exists first and playback can start against a prefix
 * while the rest is still arriving (ADR 0033). And the first fully exhausted
 * failure **stops the job**: the remaining requests are aborted rather than
 * skipped past, because a set with a hole in it that reported itself complete
 * would be exactly the false completeness the release blockers name.
 *
 * The job performs no retries of its own, for the same reason the translation
 * job does not: `OpenRouterClient` already spends its capped transport retries,
 * and a second layer would silently multiply the retry budget. **Try again** is
 * the visible, learner-driven attempt that follows them.
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
  private readonly busyRegistry = inject(AppBusyRegistry);
  private readonly logger = inject<Logger>(LOGGER, { optional: true }) ?? NOOP_LOGGER;

  private readonly progressSignal = signal<AudioJobProgress>(IDLE);
  private controller: AbortController | null = null;

  readonly progress = this.progressSignal.asReadonly();

  readonly isRunning = computed(() => {
    const kind = this.progressSignal().kind;
    return kind === 'preparing' || kind === 'running';
  });

  constructor() {
    effect(() => {
      this.busyRegistry.setBusy('audio-job', this.isRunning() ? 'an audio job is running' : null);
    });
  }

  /**
   * Reads everything in the reading that has no clip under the current voice.
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
    this.logger.info('job.started', { kind: 'audio' });
    this.progressSignal.set({ kind: 'preparing' });

    const prepared = await this.prepare(readingId);
    if (prepared === null) {
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
   * Stops scheduling further sentences and aborts the ones in flight.
   *
   * Clips already stored stay stored. They cost money, they are exactly as
   * playable individually as they were, and discarding them would be a worse
   * answer to "stop" than keeping them — and the prefix they form stays
   * playable, because playback no longer waits for a complete set (ADR 0033).
   *
   * This never stops a sound. Generation and playback are separate sessions,
   * and stopping the one that is spending money must not silence the one that
   * is not.
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
   * dismissing the report of a run that is still scheduling requests would hide
   * work that is still spending them.
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
   * than resumed: its remaining sentences were chosen for a voice that is no
   * longer configured, and continuing it would report two voices' clips under
   * one progress number.
   */
  private async prepare(
    readingId: ReadingId,
  ): Promise<{ readonly context: JobContext; readonly job: AssetJob } | null> {
    const config = this.audioConfig.resolve('tts-synthesis');
    if (!config.ok) {
      this.failProvider(config.error, emptyCounts());
      return null;
    }

    const refs = await this.readings.listSentenceRefs(readingId);
    if (!refs.ok) {
      this.failStorage(refs.error, emptyCounts());
      return null;
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
      this.failStorage(active.error, emptyCounts());
      return null;
    }

    if (
      active.value !== null &&
      active.value.configFingerprint === config.value.configFingerprint
    ) {
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

  /** Re-derives completion from stored clips, so a reload never over-reports. */
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
      kind: 'prepare-audio',
      readingId: context.readingId,
      state: 'running',
      orderedSentenceIds: missing,
      completedSentenceIds: [],
      failedItems: [],
      configFingerprint: context.config.configFingerprint,
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
    const missing = await this.audio.missingSentenceIds(context.readingId, context.cacheKeys);
    if (!missing.ok) {
      this.failStorage(missing.error, emptyCounts());
      return null;
    }
    return missing.value;
  }

  /**
   * Synthesizes the job's outstanding sentences through a bounded worker queue.
   *
   * Workers claim sentences from one shared cursor that runs in reading order,
   * so the clips that exist earliest are the ones at the front of the reading —
   * which is what makes starting playback against a partial set useful rather
   * than arbitrary. Each clip is stored and its job item recorded before that
   * worker claims another, so an interruption anywhere leaves a job whose
   * recorded progress is exactly the progress its stored rows support.
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
      this.progressSignal.set({ kind: 'complete', counts });
      return;
    }

    const loaded = await this.readings.loadSentences(context.orderedSentenceIds);
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

    const outstandingSet = new Set(outstanding);
    const allSentences = orderedByReading(loaded.value);
    const queue = allSentences.filter((sentence) => outstandingSet.has(sentence.id));

    let cursor = 0;
    let completed = counts.completed;
    // A holder rather than a `let`, so the flag a worker sets is still visible
    // to the checker after the queue has been awaited.
    const outcome: { failure: TerminalFailure | null } = { failure: null };

    /**
     * Stops the whole run at the first failure that survived transport retries.
     *
     * Aborting the controller is what makes it fail *fast*: the requests the
     * other workers already have in flight are cancelled rather than paid for,
     * and only the first failure is reported.
     */
    const failFast = (failure: TerminalFailure): void => {
      outcome.failure ??= failure;
      controller.abort();
    };

    const worker = async (): Promise<void> => {
      while (outcome.failure === null && !isAborted(signal)) {
        const index = cursor;
        cursor += 1;
        if (index >= queue.length) {
          return;
        }
        const sentence = queue[index];
        const cacheKey = context.cacheKeys.get(sentence.id);
        if (cacheKey === undefined) {
          continue;
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
        counts = { ...counts, completed };
        this.progressSignal.set({ kind: 'running', counts });
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
        this.failStorage(failure.error, counts);
        return;
      }
      await this.stopAtFailure(job, failure.sentenceId, failure.error, counts);
      return;
    }
    if (isAborted(signal)) {
      await this.markCancelled(job, counts);
      return;
    }

    this.controller = null;
    this.progressSignal.set({ kind: 'complete', counts });
    this.logger.info('job.succeeded', { kind: 'audio', count: counts.completed });
  }

  private async stopAtFailure(
    job: AssetJob,
    sentenceId: SentenceId,
    error: AiError,
    counts: AudioJobCounts,
  ): Promise<void> {
    const recorded = await this.jobs.recordFailure(job.id, {
      sentenceId,
      errorCode: error.code,
      failedAt: this.clock.now(),
    });
    if (!recorded.ok) {
      this.failStorage(recorded.error, counts);
      return;
    }
    const withFailure = { ...counts, failed: recorded.value.failedItems.length };
    const marked = await this.jobs.setState(job.id, 'failed');
    if (!marked.ok) {
      this.failStorage(marked.error, withFailure);
      return;
    }
    this.failProvider(error, withFailure);
  }

  private async markCancelled(job: AssetJob, counts: AudioJobCounts): Promise<void> {
    this.controller = null;
    await this.jobs.setState(job.id, 'cancelled');
    this.progressSignal.set({ kind: 'cancelled', counts });
    this.logger.info('job.cancelled', { kind: 'audio', count: counts.completed });
  }

  private failProvider(error: AiError, counts: AudioJobCounts): void {
    this.controller = null;
    this.progressSignal.set({ kind: 'failed', counts, error: { source: 'provider', error } });
    this.logger.error('job.failed', {
      kind: 'audio',
      errorDomain: error.domain,
      errorCode: error.code,
    });
  }

  private failStorage(error: StorageError, counts: AudioJobCounts): void {
    this.controller = null;
    this.progressSignal.set({ kind: 'failed', counts, error: { source: 'storage', error } });
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

function emptyCounts(): AudioJobCounts {
  return { total: 0, requested: 0, completed: 0, failed: 0 };
}
