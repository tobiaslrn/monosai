import { Injectable, computed, inject, signal } from '@angular/core';
import type { VocabularySourceId } from '../../domain/shared/ids';
import { VOCABULARY_SOURCE_REPOSITORY } from '../shared/repository-tokens';

/** What one source last gave Monosai, and when. */
export interface SourceStanding {
  readonly entryCount: number;
  readonly readAt: number;
}

/**
 * The last complete read of each source.
 *
 * The list needs a number and a date per row, and both are already stored: a
 * source cache is exactly the result of the last read that succeeded. Reading
 * them here rather than deriving per-source counts from the snapshot keeps one
 * fact per row honest for sources that are currently left out of the
 * vocabulary too — they still have a last read, they just do not contribute to
 * the total.
 */
@Injectable({ providedIn: 'root' })
export class SourceStandingStore {
  private readonly repository = inject(VOCABULARY_SOURCE_REPOSITORY);

  private readonly standingsSignal = signal<ReadonlyMap<VocabularySourceId, SourceStanding>>(
    new Map(),
  );

  readonly standings = this.standingsSignal.asReadonly();

  /** The most recent read across every source, or null before the first one. */
  readonly lastReadAt = computed(() => {
    const times = [...this.standingsSignal().values()].map((standing) => standing.readAt);
    return times.length === 0 ? null : Math.max(...times);
  });

  standingFor(id: VocabularySourceId): SourceStanding | null {
    return this.standingsSignal().get(id) ?? null;
  }

  async load(ids: readonly VocabularySourceId[]): Promise<void> {
    if (ids.length === 0) {
      this.standingsSignal.set(new Map());
      return;
    }
    const caches = await this.repository.readCaches(ids);
    if (!caches.ok) {
      // A missing read is a missing number, not a broken screen: the rows keep
      // their names and drop the count rather than the page reporting a failure
      // the learner cannot act on.
      return;
    }
    this.standingsSignal.set(
      new Map(
        caches.value.map((cache) => [
          cache.sourceId,
          { entryCount: cache.entries.length, readAt: cache.refreshedAt },
        ]),
      ),
    );
  }
}
