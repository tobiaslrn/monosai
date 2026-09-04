import type { AiError } from '../../domain/ai/ai-error';
import type { PreparationLayer } from '../../domain/enrichment/preparation';
import type { ReadingId } from '../../domain/shared/ids';
import type { StorageError } from '../../domain/storage/storage-error';

/**
 * The vocabulary the preparation lane and the three layer producers share.
 *
 * A leaf module on purpose: the producers import these types and the lane
 * imports the producers, so putting the shared shapes anywhere else would make
 * a cycle out of what is really one small agreement.
 */

export type LayerError =
  | { readonly source: 'provider'; readonly error: AiError }
  | { readonly source: 'storage'; readonly error: StorageError };

export interface LayerCounts {
  /** Sentences in the reading, prepared or not. */
  readonly total: number;
  /** Sentences this run set out to prepare. */
  readonly requested: number;
  readonly completed: number;
  readonly failed: number;
}

/** The request or persistence phase of a grammar batch. */
export type GrammarProgressPhase = 'requesting' | 'saving';

/**
 * One layer's state for one reading.
 *
 * `paused` is the lane's own state and is deliberately distinct from
 * `cancelled`. A paused run is resumable and nothing about it is final;
 * reporting it as cancelled would, among other things, tell the reader to seal
 * the media source a screen-locked listening session is playing from
 * (ADR 0045).
 */
export type LayerProgress =
  | { readonly kind: 'idle' }
  | { readonly kind: 'preparing'; readonly readingId: ReadingId }
  /** The lane's own: outstanding, and waiting its turn. No producer reports it. */
  | { readonly kind: 'queued'; readonly readingId: ReadingId }
  | {
      readonly kind: 'running';
      readonly readingId: ReadingId;
      readonly counts: LayerCounts;
      /** Present for grammar so the reader can report the real current phase. */
      readonly phase?: GrammarProgressPhase;
    }
  | { readonly kind: 'paused'; readonly readingId: ReadingId; readonly counts: LayerCounts }
  | { readonly kind: 'complete'; readonly readingId: ReadingId; readonly counts: LayerCounts }
  | { readonly kind: 'cancelled'; readonly readingId: ReadingId; readonly counts: LayerCounts }
  | { readonly kind: 'deleted'; readonly readingId: ReadingId }
  | {
      readonly kind: 'failed';
      readonly readingId: ReadingId;
      readonly counts: LayerCounts;
      readonly error: LayerError;
      /** False once repeating the same request cannot plausibly produce anything. */
      readonly canRetry: boolean;
    };

export const IDLE_LAYER_PROGRESS: LayerProgress = { kind: 'idle' };

/**
 * What happened when the lane asked a layer to queue a reading.
 *
 * `unavailable` is not a failure of the reading: it says the layer cannot be
 * configured right now, which is worth telling the learner once rather than
 * recording against every reading in the queue.
 */
export type EnqueueOutcome =
  | { readonly kind: 'queued' }
  | { readonly kind: 'nothing-to-do' }
  | { readonly kind: 'unavailable'; readonly error: LayerError };

export const NOTHING_TO_DO: EnqueueOutcome = { kind: 'nothing-to-do' };
export const QUEUED: EnqueueOutcome = { kind: 'queued' };

/** Why the lane is not working right now, in the learner's terms. */
export type LaneHold = 'generation' | 'offline' | 'update' | 'claimed-elsewhere';

export interface LanePlacement {
  readonly readingId: ReadingId;
  readonly layer: PreparationLayer;
}
