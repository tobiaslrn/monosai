import { Injectable, inject } from '@angular/core';
import type { PreparationLayer } from '../../domain/enrichment/preparation';
import type { ReadingId } from '../../domain/shared/ids';
import { AudioJobStore, type AudioJobProgress } from './audio-job.store';
import { GrammarJobStore, type GrammarJobProgress } from './grammar-job.store';
import { TranslationJobStore, type TranslationJobProgress } from './translation-job.store';
import { IDLE_LAYER_PROGRESS, type EnqueueOutcome, type LayerProgress } from './layer-progress';

/**
 * One aid layer's producer, as the preparation lane sees it.
 *
 * The three job stores were written independently and already agree on almost
 * everything: a captured context, bounded work, every success stored
 * before the next request, no retries of their own. This interface is that
 * agreement written down, so the lane sequences three layers without knowing
 * what any of them produces.
 *
 * `enqueue` is separate from `start` because declaring that a reading should
 * have a layer and spending money on it are different acts, and the lane exists
 * to keep them apart.
 */
export interface LayerRunner {
  readonly layer: PreparationLayer;
  /** Creates the job row and issues nothing. */
  enqueue(readingId: ReadingId): Promise<EnqueueOutcome>;
  start(readingId: ReadingId): Promise<void>;
  resume(readingId: ReadingId): Promise<void>;
  retry(readingId: ReadingId): Promise<void>;
  /** Parks the run at its next safe boundary, leaving it resumable. */
  yieldAfterBatch(): void;
  cancel(readingId: ReadingId): void;
  cancelAndWait(readingId: ReadingId): Promise<void>;
  acknowledge(readingId: ReadingId): void;
  readingDeleted(readingId: ReadingId): Promise<void>;
  progressFor(readingId: ReadingId): LayerProgress;
  isRunning(): boolean;
}

/**
 * Folds one store's progress into the lane's.
 *
 * Only `failed` differs between the three: audio knows whether running the same
 * request again could plausibly produce a clip, and the other two have no such
 * question to answer, so their failures are always worth retrying.
 */
function toLayerProgress(
  progress: TranslationJobProgress | GrammarJobProgress | AudioJobProgress,
): LayerProgress {
  if (progress.kind !== 'failed') {
    return progress;
  }
  return { ...progress, canRetry: 'canRetry' in progress ? progress.canRetry : true };
}

/** The three producers, addressed by the layer they fill in. */
@Injectable({ providedIn: 'root' })
export class LayerRunners {
  private readonly translation = inject(TranslationJobStore);
  private readonly grammar = inject(GrammarJobStore);
  private readonly audio = inject(AudioJobStore);

  private readonly runners: Readonly<Record<PreparationLayer, LayerRunner>> = {
    english: adapt('english', this.translation),
    grammar: adapt('grammar', this.grammar),
    audio: adapt('audio', this.audio),
  };

  runnerFor(layer: PreparationLayer): LayerRunner {
    return this.runners[layer];
  }

  all(): readonly LayerRunner[] {
    return [this.runners.english, this.runners.grammar, this.runners.audio];
  }
}

/** The store surface the lane relies on, which all three already have. */
interface JobStoreLike {
  enqueue(readingId: ReadingId): Promise<EnqueueOutcome>;
  start(readingId: ReadingId): Promise<void>;
  resume(readingId: ReadingId): Promise<void>;
  retry(readingId: ReadingId): Promise<void>;
  yieldAfterBatch(): void;
  cancel(readingId: ReadingId): void;
  cancelAndWait(readingId: ReadingId): Promise<void>;
  acknowledge(readingId: ReadingId): void;
  readingDeleted(readingId: ReadingId): Promise<void>;
  progressFor(readingId: ReadingId): TranslationJobProgress | GrammarJobProgress | AudioJobProgress;
  isRunning(): boolean;
}

function adapt(layer: PreparationLayer, store: JobStoreLike): LayerRunner {
  return {
    layer,
    enqueue: (readingId) => store.enqueue(readingId),
    start: (readingId) => store.start(readingId),
    resume: (readingId) => store.resume(readingId),
    retry: (readingId) => store.retry(readingId),
    yieldAfterBatch: () => {
      store.yieldAfterBatch();
    },
    cancel: (readingId) => {
      store.cancel(readingId);
    },
    cancelAndWait: (readingId) => store.cancelAndWait(readingId),
    acknowledge: (readingId) => {
      store.acknowledge(readingId);
    },
    readingDeleted: (readingId) => store.readingDeleted(readingId),
    progressFor: (readingId) => toLayerProgress(store.progressFor(readingId)),
    isRunning: () => store.isRunning(),
  };
}

export { IDLE_LAYER_PROGRESS };
