import { Injectable, inject, signal } from '@angular/core';
import {
  vocabularyAvailability,
  type VocabularyAvailability,
} from '../../domain/vocabulary/snapshot';
import { VOCABULARY_REPOSITORY } from '../shared/repository-tokens';

export type VocabularyAvailabilityState =
  | { readonly kind: 'unknown' }
  | { readonly kind: 'known'; readonly availability: VocabularyAvailability }
  | { readonly kind: 'unavailable'; readonly message: string };

/**
 * Whether there is a vocabulary to classify against, for surfaces outside the
 * Vocabulary page.
 *
 * The reader needs one fact — is there a snapshot, is it empty, or could it not
 * be read — and nothing else the vocabulary page loads: no provenance, no story
 * counts. Reading it separately keeps the reader off that page's heavier read
 * model while still telling the learner why marking looks the way it does.
 */
@Injectable({ providedIn: 'root' })
export class VocabularyAvailabilityStore {
  private readonly vocabulary = inject(VOCABULARY_REPOSITORY);

  private readonly stateSignal = signal<VocabularyAvailabilityState>({ kind: 'unknown' });

  readonly state = this.stateSignal.asReadonly();

  async refresh(): Promise<void> {
    const active = await this.vocabulary.getActiveSnapshot();
    this.stateSignal.set(
      active.ok
        ? { kind: 'known', availability: vocabularyAvailability(active.value) }
        : { kind: 'unavailable', message: active.error.message },
    );
  }
}
