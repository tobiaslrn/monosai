import {
  DestroyRef,
  Injectable,
  computed,
  inject,
  linkedSignal,
  resource,
  signal,
} from '@angular/core';
import type { VocabularySourceId } from '../../domain/shared/ids';
import { VOCABULARY_SOURCE_REPOSITORY } from '../shared/repository-tokens';
import { SnapshotHistoryStore } from './snapshot-history.store';
import { SourceMappingStore } from './source-mapping.store';

/** What one source last gave Monosai, and when. */
export interface SourceStanding {
  readonly entryCount: number;
  readonly readAt: number;
}

type Standings = ReadonlyMap<VocabularySourceId, SourceStanding>;

const NO_STANDINGS: Standings = new Map();

/**
 * The last complete read of each source.
 *
 * The list needs a number and a date per row, and both are already stored: a
 * source cache is exactly the result of the last read that succeeded. Reading
 * them here rather than deriving per-source counts from the snapshot keeps one
 * fact per row honest for sources that are currently left out of the
 * vocabulary too — they still have a last read, they just do not contribute to
 * the total.
 *
 * The numbers follow what they are read from: the list of sources, and the
 * current snapshot, because re-reading one source changes its cache without
 * changing the list the rows come from. Nothing is read until a screen asks to
 * `follow` them, and nothing is read after the last of those has gone.
 */
@Injectable({ providedIn: 'root' })
export class SourceStandingStore {
  private readonly repository = inject(VOCABULARY_SOURCE_REPOSITORY);
  private readonly sources = inject(SourceMappingStore);
  private readonly history = inject(SnapshotHistoryStore);

  /** How many screens are showing these numbers, so unwatched ones are not read. */
  private readonly followers = signal(0);

  private readonly read = resource({
    params: () =>
      this.followers() === 0
        ? undefined
        : {
            ids: this.sources.sources().map((source) => source.id),
            // Only a change of this is read, not its value: a finished commit
            // is a new snapshot object even when the number of words is the same.
            committed: this.history.active(),
          },
    loader: ({ params }) => this.readStandings(params.ids),
  });

  /** Kept while the next read is in flight, and when a read fails. */
  readonly standings = linkedSignal<Standings | undefined, Standings>({
    source: () => (this.read.hasValue() ? this.read.value() : undefined),
    computation: (next, previous) => next ?? previous?.value ?? NO_STANDINGS,
  });

  /** The most recent read across every source, or null before the first one. */
  readonly lastReadAt = computed(() => {
    const times = [...this.standings().values()].map((standing) => standing.readAt);
    return times.length === 0 ? null : Math.max(...times);
  });

  standingFor(id: VocabularySourceId): SourceStanding | null {
    return this.standings().get(id) ?? null;
  }

  /**
   * Keeps the numbers current for as long as the calling screen lives. Called
   * from a constructor, so the screen's destruction ends it.
   */
  follow(): void {
    const destroyRef = inject(DestroyRef);
    this.followers.update((count) => count + 1);
    destroyRef.onDestroy(() => {
      this.followers.update((count) => count - 1);
    });
  }

  private async readStandings(ids: readonly VocabularySourceId[]): Promise<Standings | undefined> {
    if (ids.length === 0) {
      return new Map();
    }
    const caches = await this.repository.readCaches(ids);
    if (!caches.ok) {
      // A missing read is a missing number, not a broken screen: the rows keep
      // their names and drop the count rather than the page reporting a failure
      // the learner cannot act on.
      return undefined;
    }
    return new Map(
      caches.value.map((cache) => [
        cache.sourceId,
        { entryCount: cache.entries.length, readAt: cache.refreshedAt },
      ]),
    );
  }
}
