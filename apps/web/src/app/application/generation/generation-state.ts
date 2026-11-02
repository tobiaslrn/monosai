import type { AiError } from '../../domain/ai/ai-error';
import type { LanguageError } from '../../domain/language/language-error';
import type { GeneratedStory } from '../../domain/reading/reading';
import type { StorageError } from '../../domain/storage/storage-error';

export type GenerationFailure = AiError | LanguageError | StorageError;

/**
 * The generation state machine from ai-pipelines section 5.
 *
 * The ordering carries the guarantee: everything up to `finalizing` is
 * discardable, so a cancellation or a failure at any of those states leaves no
 * reading row, and `finalizing` is the one non-cancellable state because it is
 * a single transaction that either writes the whole story or writes nothing.
 */
export type GenerationState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'checking-prerequisites' }
  | { readonly kind: 'preparing' }
  | { readonly kind: 'writing' }
  | { readonly kind: 'parsing' }
  | { readonly kind: 'validating' }
  | { readonly kind: 'exception-review'; readonly candidateCount: number }
  | {
      readonly kind: 'repairing';
      readonly attempt: number;
      readonly totalAttempts: number;
      readonly unknownCount: number;
      readonly structureIssueCount: number;
    }
  | { readonly kind: 'finalizing' }
  | { readonly kind: 'saved'; readonly reading: GeneratedStory }
  | {
      readonly kind: 'cancelled';
      /** The stage the run was in when it was cancelled. */
      readonly during: RunningStateKind;
    }
  | {
      readonly kind: 'failed';
      readonly error: GenerationFailure;
      /**
       * The stage the run was in when it failed.
       *
       * A terminal state names no stage of its own, and the progress display
       * has to say where the run stopped rather than painting everything as
       * never started.
       */
      readonly during: RunningStateKind;
    };

/** The states a run passes through, as opposed to the ones it ends in. */
export type RunningStateKind =
  | 'checking-prerequisites'
  | 'preparing'
  | 'writing'
  | 'parsing'
  | 'validating'
  | 'exception-review'
  | 'repairing'
  | 'finalizing';

export const IDLE: GenerationState = { kind: 'idle' };

/** States where a cancel request is still meaningful. */
export const CANCELLABLE = new Set<GenerationState['kind']>([
  'checking-prerequisites',
  'preparing',
  'writing',
  'parsing',
  'validating',
  'exception-review',
  'repairing',
]);

/** What the learner is told while a repair runs. */
export function repairAnnouncement(
  unknownCount: number,
  structureIssueCount: number,
  attempt: number,
  totalAttempts: number,
): string {
  const work =
    unknownCount > 0
      ? `Replacing ${String(unknownCount)} unfamiliar ${unknownCount === 1 ? 'word' : 'words'}${structureIssueCount > 0 ? ' and fixing the story structure' : ''}`
      : 'Fixing the story structure';
  return `${work} (attempt ${String(attempt)} of ${String(totalAttempts)})…`;
}
