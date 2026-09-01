import { DestroyRef, Injectable, inject } from '@angular/core';
import type { ReadingId } from '../../domain/shared/ids';
import { READING_MUTATION_CHANNEL } from '../shared/repository-tokens';
import type { ReadingDeletedMutation, ReadingMutation } from './reading-mutation-channel';

/**
 * Tells the profile's other tabs what this one changed, and lets this one
 * react to what they changed.
 *
 * Monosai is local-first, so two tabs on the same database is a normal thing to
 * have. Without this, a tab went on rendering a reading another tab had already
 * deleted — every token live, every cached aid shown — until it was navigated
 * away and back. See ADR 0042.
 */
@Injectable({ providedIn: 'root' })
export class ReadingMutationsService {
  private readonly channel = inject(READING_MUTATION_CHANNEL);
  private readonly listeners = new Set<(mutation: ReadingMutation) => void>();

  constructor() {
    const unsubscribe = this.channel.subscribe((mutation) => {
      // Copied first: a listener may unsubscribe while the set is being walked.
      for (const listener of [...this.listeners]) {
        listener(mutation);
      }
    });
    inject(DestroyRef).onDestroy(unsubscribe);
  }

  /** Announces a deletion this tab performed and has already committed. */
  publishDeleted(id: ReadingId, title: string): void {
    this.channel.publish({ kind: 'reading-deleted', id, title });
  }

  /**
   * Subscribes to deletions performed in another tab. Returns the teardown.
   *
   * Deletion is the whole of `ReadingMutation` today, so the listener is
   * registered directly. Adding a second kind makes this assignment a type
   * error, which is where the narrowing then belongs.
   */
  onDeletedElsewhere(listener: (mutation: ReadingDeletedMutation) => void): () => void {
    const wrapped: (mutation: ReadingMutation) => void = listener;
    this.listeners.add(wrapped);
    return () => {
      this.listeners.delete(wrapped);
    };
  }
}
