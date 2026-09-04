import { Injectable, computed, inject, signal } from '@angular/core';
import {
  vocabularyAvailability,
  type VocabularyAvailability,
  type VocabularySnapshot,
} from '../../domain/vocabulary/snapshot';
import { VOCABULARY_REPOSITORY } from '../shared/repository-tokens';

export type VocabularyAvailabilityState =
  | { readonly kind: 'unknown' }
  | {
      readonly kind: 'known';
      readonly availability: VocabularyAvailability;
      /** Null exactly when the availability is `none`; there is nothing to describe. */
      readonly snapshot: VocabularySnapshot | null;
    }
  | { readonly kind: 'unavailable'; readonly message: string };

/**
 * Whether there is a vocabulary to classify against, and how big it is, for
 * surfaces outside the reading-level page.
 *
 * The reader needs one fact — is there a snapshot, is it empty, or could it not
 * be read — and the Library states the count and where it came from. Both come
 * out of the same single `getActiveSnapshot()` read, which is why the snapshot
 * is carried here rather than sending either screen to `SnapshotHistoryStore`:
 * that one also counts stories and resolves provenance, which is a far heavier
 * read than a home screen should make.
 */
@Injectable({ providedIn: 'root' })
export class VocabularyAvailabilityStore {
  private readonly vocabulary = inject(VOCABULARY_REPOSITORY);

  private readonly stateSignal = signal<VocabularyAvailabilityState>({ kind: 'unknown' });

  readonly state = this.stateSignal.asReadonly();

  /** The current word count, or null while it is unknown or unreadable. */
  readonly uniqueEntryCount = computed(() => {
    const state = this.stateSignal();
    return state.kind === 'known' ? (state.snapshot?.uniqueEntryCount ?? 0) : null;
  });

  async refresh(): Promise<void> {
    const active = await this.vocabulary.getActiveSnapshot();
    this.stateSignal.set(
      active.ok
        ? {
            kind: 'known',
            availability: vocabularyAvailability(active.value),
            snapshot: active.value,
          }
        : { kind: 'unavailable', message: active.error.message },
    );
  }
}
