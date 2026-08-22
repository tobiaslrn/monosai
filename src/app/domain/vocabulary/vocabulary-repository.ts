import type { Result } from '../shared/result';
import type { SnapshotId } from '../shared/ids';
import type { StorageError } from '../storage/storage-error';
import type { VocabularyItem, VocabularyProvenance, VocabularySnapshot } from './snapshot';

/** One atomic replacement: snapshot, items, provenance, then activation. */
export interface SnapshotCommit {
  readonly snapshot: VocabularySnapshot;
  readonly items: readonly VocabularyItem[];
  readonly provenance: readonly VocabularyProvenance[];
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
