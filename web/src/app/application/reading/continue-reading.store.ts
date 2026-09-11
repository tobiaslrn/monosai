import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import type { Reading } from '../../domain/reading/reading';
import type { StorageError } from '../../domain/storage/storage-error';
import { READING_REPOSITORY } from '../shared/repository-tokens';
import { ReadingMutationsService } from './reading-mutations.service';

export type ContinueReadingState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'none' }
  | { readonly kind: 'ready'; readonly reading: Reading }
  | { readonly kind: 'failed'; readonly error: StorageError };

/**
 * The story to pick up again: the one opened most recently.
 *
 * Provided by the screen that shows it, so it is read afresh each time that
 * screen opens and reflects a story opened a moment ago.
 */
@Injectable()
export class ContinueReadingStore {
  private readonly readings = inject(READING_REPOSITORY);
  private readonly mutations = inject(ReadingMutationsService);

  private readonly stateSignal = signal<ContinueReadingState>({ kind: 'loading' });
  private requestRevision = 0;

  readonly state = this.stateSignal.asReadonly();

  constructor() {
    // A story deleted in another tab must not stay offered here.
    const unsubscribe = this.mutations.onDeletedElsewhere((mutation) => {
      const state = this.stateSignal();
      if (state.kind === 'ready' && state.reading.id === mutation.id) {
        void this.load();
      }
    });
    inject(DestroyRef).onDestroy(unsubscribe);
  }

  async load(): Promise<void> {
    const requestRevision = ++this.requestRevision;
    this.stateSignal.set({ kind: 'loading' });

    const found = await this.readings.findLastOpened();
    if (requestRevision !== this.requestRevision) {
      return;
    }
    if (!found.ok) {
      this.stateSignal.set({ kind: 'failed', error: found.error });
      return;
    }
    this.stateSignal.set(
      found.value === null ? { kind: 'none' } : { kind: 'ready', reading: found.value },
    );
  }
}
