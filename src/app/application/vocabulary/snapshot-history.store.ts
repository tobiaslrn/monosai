import { Injectable, computed, inject, signal } from '@angular/core';
import type { SnapshotId } from '../../domain/shared/ids';
import type { StorageError } from '../../domain/storage/storage-error';
import {
  meetsGenerationMinimum,
  type AnkiProviderKind,
  type VocabularySnapshot,
} from '../../domain/vocabulary/snapshot';
import { VOCABULARY_REPOSITORY } from '../shared/repository-tokens';

/** The current vocabulary row, with the details the page has to show. */
export interface SnapshotHistoryEntry {
  readonly snapshot: VocabularySnapshot;
  readonly isActive: boolean;
  /** Distinct deck and note type pairs the snapshot was built from. */
  readonly sources: readonly string[];
  readonly providerKinds: readonly AnkiProviderKind[];
  readonly storyCount: number;
}

/** Reads the one current vocabulary snapshot and its small page summary. */
@Injectable({ providedIn: 'root' })
export class SnapshotHistoryStore {
  private readonly vocabulary = inject(VOCABULARY_REPOSITORY);

  private readonly entriesSignal = signal<readonly SnapshotHistoryEntry[]>([]);
  private readonly loadedSignal = signal(false);
  private readonly failureSignal = signal<StorageError | null>(null);

  readonly entries = this.entriesSignal.asReadonly();
  readonly loaded = this.loadedSignal.asReadonly();
  readonly lastFailure = this.failureSignal.asReadonly();

  readonly activeEntry = computed(
    () => this.entriesSignal().find((entry) => entry.isActive) ?? null,
  );
  readonly active = computed(() => this.activeEntry()?.snapshot ?? null);
  readonly meetsGenerationMinimum = computed(() => meetsGenerationMinimum(this.active()));

  async load(): Promise<void> {
    const current = await this.vocabulary.getActiveSnapshot();
    if (!current.ok) {
      this.failureSignal.set(current.error);
      return;
    }

    const entries: SnapshotHistoryEntry[] =
      current.value === null
        ? []
        : [
            {
              snapshot: current.value,
              isActive: true,
              sources: await this.describeSources(current.value.id),
              providerKinds: current.value.providerKinds,
              storyCount: await this.countStories(current.value.id),
            },
          ];

    this.entriesSignal.set(entries);
    this.failureSignal.set(null);
    this.loadedSignal.set(true);
  }

  /**
   * A readable summary of where a snapshot's vocabulary came from.
   *
   * Provenance holds one record per item and source, so the deck and note type
   * pairs are collapsed to the handful the list actually shows.
   */
  private async describeSources(id: SnapshotId): Promise<readonly string[]> {
    const provenance = await this.vocabulary.listProvenance(id);
    if (!provenance.ok) {
      return [];
    }
    const seen = new Set<string>();
    for (const record of provenance.value) {
      seen.add(`${record.deckName} · ${record.noteTypeName} · ${record.fieldName}`);
    }
    return [...seen].sort();
  }

  private async countStories(id: SnapshotId): Promise<number> {
    const counted = await this.vocabulary.countStoriesUsingSnapshot(id);
    return counted.ok ? counted.value : 0;
  }
}
