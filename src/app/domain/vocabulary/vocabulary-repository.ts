import type { Result } from '../shared/result';
import type { SnapshotId } from '../shared/ids';
import type { StorageError } from '../storage/storage-error';
import type { VocabularyItem, VocabularyProvenance, VocabularySnapshot } from './snapshot';
import type { VocabularySource, VocabularySourceCache } from './vocabulary-source';

/** The vocabulary content one commit replaces, before its inputs are attached. */
export interface VocabularyContent {
  readonly snapshot: VocabularySnapshot;
  readonly items: readonly VocabularyItem[];
  readonly provenance: readonly VocabularyProvenance[];
}

/**
 * One atomic replacement: the sources and caches the vocabulary was built from,
 * then snapshot, items, provenance, and activation.
 *
 * Sources and caches belong inside the same boundary as the snapshot because
 * they are the inputs it was derived from: a commit that stored a new package
 * mapping but failed to store the vocabulary would leave an enabled source with
 * no cache behind it, and the next rebuild would silently drop its words.
 */
export interface SnapshotCommit extends VocabularyContent {
  /** Sources created or replaced by this commit, upserted before the snapshot. */
  readonly sources: readonly VocabularySource[];
  /** Source caches this commit replaces. */
  readonly caches: readonly VocabularySourceCache[];
}

export interface VocabularyRepository {
  /** Replaces the current vocabulary atomically; at most one snapshot remains. */
  commitSnapshot(commit: SnapshotCommit): Promise<Result<VocabularySnapshot, StorageError>>;
  /** Lists persisted vocabulary rows; the application keeps this at zero or one. */
  listSnapshots(): Promise<Result<readonly VocabularySnapshot[], StorageError>>;
  getActiveSnapshot(): Promise<Result<VocabularySnapshot | null, StorageError>>;
  getSnapshot(id: SnapshotId): Promise<Result<VocabularySnapshot | null, StorageError>>;
  /** Lists canonical expression hashes for comparing two vocabulary contents. */
  listExpressionHashes(id: SnapshotId): Promise<Result<readonly string[], StorageError>>;
  /** Streams matcher input in bounded batches instead of one large array. */
  streamItems(id: SnapshotId, batchSize: number): AsyncIterable<readonly VocabularyItem[]>;
  listProvenance(id: SnapshotId): Promise<Result<readonly VocabularyProvenance[], StorageError>>;
  countStoriesUsingSnapshot(id: SnapshotId): Promise<Result<number, StorageError>>;
}
