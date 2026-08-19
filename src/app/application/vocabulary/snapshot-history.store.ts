import { Injectable, computed, inject, signal } from '@angular/core';
import type { SnapshotId } from '../../domain/shared/ids';
import type { StorageError } from '../../domain/storage/storage-error';
import {
  meetsGenerationMinimum,
  type AnkiProviderKind,
  type VocabularySnapshot,
} from '../../domain/vocabulary/snapshot';
import { AppSettingsStore } from '../settings/app-settings.store';
import { VOCABULARY_REPOSITORY } from '../shared/repository-tokens';

/** One row of the snapshot history, with the details the list has to show. */
export interface SnapshotHistoryEntry {
  readonly snapshot: VocabularySnapshot;
  readonly isActive: boolean;
  /** Distinct deck and note type pairs the snapshot was built from. */
  readonly sources: readonly string[];
  readonly providerKinds: readonly AnkiProviderKind[];
  readonly storyCount: number;
}

/**
 * The append-only history of vocabulary snapshots.
 *
 * Snapshots are never deleted in v1, and the newest completed one is active, so
 * this is a read-only view. The story count matters because it is what tells a
 * learner an older snapshot is still holding up generated stories rather than
 * being dead weight.
 */
@Injectable({ providedIn: 'root' })
export class SnapshotHistoryStore {
  private readonly vocabulary = inject(VOCABULARY_REPOSITORY);
  private readonly settings = inject(AppSettingsStore);

  private readonly entriesSignal = signal<readonly SnapshotHistoryEntry[]>([]);
  private readonly loadedSignal = signal(false);
  private readonly failureSignal = signal<StorageError | null>(null);

  readonly entries = this.entriesSignal.asReadonly();
  readonly loaded = this.loadedSignal.asReadonly();
  readonly lastFailure = this.failureSignal.asReadonly();

  readonly active = computed(
    () => this.entriesSignal().find((entry) => entry.isActive)?.snapshot ?? null,
  );
  readonly meetsGenerationMinimum = computed(() => meetsGenerationMinimum(this.active()));

  async load(): Promise<void> {
    const listed = await this.vocabulary.listSnapshots();
    if (!listed.ok) {
      this.failureSignal.set(listed.error);
      return;
    }

    const activeId = this.settings.activeSnapshotId();
    const entries: SnapshotHistoryEntry[] = [];
    for (const snapshot of [...listed.value].sort(
      (left, right) => right.createdAt - left.createdAt,
    )) {
      entries.push({
        snapshot,
        isActive: snapshot.id === activeId,
        sources: await this.describeSources(snapshot.id),
        providerKinds: snapshot.providerKinds,
        storyCount: await this.countStories(snapshot.id),
      });
    }

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
