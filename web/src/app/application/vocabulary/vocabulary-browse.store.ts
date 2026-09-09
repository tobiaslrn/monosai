import { Injectable, computed, inject, signal } from '@angular/core';
import { CLOCK, VOCABULARY_REPOSITORY } from '../shared/repository-tokens';
import type { StorageError } from '../../domain/storage/storage-error';
import type { VocabularyItemId } from '../../domain/shared/ids';
import {
  applyBrowseQuery,
  DEFAULT_BROWSE_QUERY,
  type BrowseQuery,
} from '../../domain/vocabulary/vocabulary-browse';
import type {
  CapturedSourceObservation,
  VocabularyEntry,
} from '../../domain/vocabulary/vocabulary-repository';
import type { VocabularySnapshot } from '../../domain/vocabulary/snapshot';

export type VocabularyBrowseState = 'loading' | 'ready' | 'empty' | 'unavailable' | 'failed';

/** The query and one atomic repository result used by the vocabulary browser. */
@Injectable({ providedIn: 'root' })
export class VocabularyBrowseStore {
  private readonly repository = inject(VOCABULARY_REPOSITORY);
  private readonly clock = inject(CLOCK);

  private readonly stateSignal = signal<VocabularyBrowseState>('loading');
  private readonly entriesSignal = signal<readonly VocabularyEntry[]>([]);
  private readonly sourcesSignal = signal<readonly CapturedSourceObservation[]>([]);
  private readonly snapshotSignal = signal<VocabularySnapshot | null>(null);
  private readonly failureSignal = signal<StorageError | null>(null);

  readonly state = this.stateSignal.asReadonly();
  readonly entries = this.entriesSignal.asReadonly();
  readonly sources = this.sourcesSignal.asReadonly();
  readonly snapshot = this.snapshotSignal.asReadonly();
  readonly lastError = this.failureSignal.asReadonly();
  readonly query = signal<BrowseQuery>(DEFAULT_BROWSE_QUERY);
  readonly expandedId = signal<VocabularyItemId | null>(null);

  readonly visible = computed(() =>
    applyBrowseQuery(this.entriesSignal(), this.query(), this.clock.now()),
  );
  readonly matchCount = computed(() => this.visible().length);

  async load(): Promise<void> {
    this.stateSignal.set('loading');
    const loaded = await this.repository.listVocabularyEntries();
    if (!loaded.ok) {
      this.failureSignal.set(loaded.error);
      this.stateSignal.set(loaded.error.code === 'unavailable' ? 'unavailable' : 'failed');
      return;
    }
    this.failureSignal.set(null);
    this.expandedId.set(null);
    if (loaded.value === null) {
      this.entriesSignal.set([]);
      this.sourcesSignal.set([]);
      this.snapshotSignal.set(null);
      this.stateSignal.set('empty');
      return;
    }
    this.entriesSignal.set(loaded.value.entries);
    this.sourcesSignal.set(loaded.value.sources);
    this.snapshotSignal.set(loaded.value.snapshot);
    this.stateSignal.set(loaded.value.entries.length === 0 ? 'empty' : 'ready');
  }

  setSearch(search: string): void {
    this.updateQuery({ search });
  }

  setSource(sourceId: BrowseQuery['sourceId']): void {
    this.updateQuery({ sourceId });
  }

  applyQuery(query: BrowseQuery): void {
    this.query.set(normalizeQuery(query));
    this.expandedId.set(null);
  }

  reset(): void {
    this.applyQuery(DEFAULT_BROWSE_QUERY);
  }

  setExpanded(id: VocabularyItemId | null): void {
    this.expandedId.set(id);
  }

  private updateQuery(patch: Partial<BrowseQuery>): void {
    this.query.update((current) =>
      normalizeQuery({
        ...current,
        ...patch,
        difficulty: {
          ...current.difficulty,
          ...(patch.difficulty ?? {}),
        },
      }),
    );
    this.expandedId.set(null);
  }
}

function normalizeQuery(query: BrowseQuery): BrowseQuery {
  const min = clampPercent(query.difficulty.min);
  const max = clampPercent(query.difficulty.max);
  return {
    ...query,
    difficulty: min <= max ? { min, max } : { min: max, max: min },
  };
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
}
