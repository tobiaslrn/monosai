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

/** Reads the flag through a call, so an earlier check never narrows a later one. */
function isAborted(signal: AbortSignal): boolean {
  return signal.aborted;
}

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
 * specification insists on. Sentences are synthesized **strictly in reading
 * order, one at a time**, because the endpoint takes one input per request and
 * concurrency one is what keeps rate limits and progress predictable
 * (`ai-pipelines.md` section 11 step 5). And the first failure **stops the job
 * at that sentence** rather than skipping it: the whole point of the set is
 * that it can be played end to end, and a set with a hole in it that reported
 * itself complete would be exactly the false completeness the release blockers
 * name.
 *
 * The job performs no retries of its own, for the same reason the translation
 * job does not: `OpenRouterClient` already spends its capped transport retries,
 * and a second layer would silently multiply the retry budget.
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
   * Stops scheduling further sentences.
   *
   * Clips already stored stay stored. They cost money, they are exactly as
   * playable individually as they were, and discarding them would be a worse
   * answer to "stop" than keeping them — even though the whole-reading gate
   * stays shut until the set is finished.
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
   * Synthesizes the job's outstanding sentences, one request at a time, in the
   * order they are read.
   *
   * Each clip is stored and its job item recorded before the next request is
   * made, so an interruption anywhere leaves a job whose recorded progress is
   * exactly the progress its stored rows support.
   */
  private async process(context: JobContext, job: AssetJob, signal: AbortSignal): Promise<void> {
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

    // `loadSentences` answers in reading order, which is the order clips are
    // produced in: a learner who stops a run halfway has the beginning of the
    // reading, which is the half they can use.
    const outstandingSet = new Set(outstanding);
    const allSentences = orderedByReading(loaded.value);
    for (const sentence of allSentences) {
      if (!outstandingSet.has(sentence.id)) {
        continue;
      }
      if (isAborted(signal)) {
        await this.markCancelled(job, counts);
        return;
      }

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
        // Cancelling aborts the request already in flight, and that arrives
        // here as a refusal. Reporting it as a failure would offer a Retry for
        // something the learner had just stopped, so the signal decides which
        // of the two this is.
        if (isAborted(signal)) {
          await this.markCancelled(job, counts);
          return;
        }
        // Stop here rather than moving on: skipping would leave a hole in a set
        // whose only purpose is to be played from end to end.
        await this.stopAtFailure(job, sentence.id, produced.error, counts);
        return;
      }
      // A clip that did arrive is stored even when the run has been cancelled
      // since: it has already been paid for, and it is exactly as playable on
      // its own as it would have been. The loop stops before the next request.

      const stored = await this.audio.store(produced.value, context.cacheKeys);
      if (!stored.ok) {
        this.failStorage(stored.error, counts);
        return;
      }
      const advanced = await this.jobs.recordCompletion(job.id, sentence.id);
      if (!advanced.ok) {
        this.failStorage(advanced.error, counts);
        return;
      }
      counts = { ...counts, completed: advanced.value.completedSentenceIds.length };
      this.progressSignal.set({ kind: 'running', counts });
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
 * "Strictly in reading order" is a rule of this job, and a rule that depends on
 * another layer's incidental ordering is a rule that breaks quietly.
 */
function orderedByReading(sentences: readonly Sentence[]): readonly Sentence[] {
  return [...sentences].sort((left, right) => left.positionInReading - right.positionInReading);
}

function emptyCounts(): AudioJobCounts {
  return { total: 0, requested: 0, completed: 0, failed: 0 };
}
