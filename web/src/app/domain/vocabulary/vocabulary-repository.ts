import type { Result } from '../shared/result';
import type { SnapshotId, VocabularySourceId } from '../shared/ids';
import type { StorageError } from '../storage/storage-error';
import type { PracticeObservationBasis } from '../anki/practice-evidence';
import type {
  VocabularyExpression,
  VocabularyItem,
  VocabularyProvenance,
  VocabularySnapshot,
} from './snapshot';
import type {
  AnkiProviderKind,
  VocabularySource,
  VocabularySourceCache,
  VocabularySourceKind,
} from './vocabulary-source';

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
  /**
   * The revision this build was prepared against, when the caller knows it.
   *
   * Building a vocabulary is slow enough that another tab can commit while one
   * is being prepared, and the loser would otherwise overwrite a newer refresh
   * or a source the learner has just removed with content assembled before
   * either happened. Given here, the commit fails as a conflict instead, and
   * the caller re-prepares against what is actually stored. Omitted for the
   * first commit and wherever no earlier state was read.
   */
  readonly expectedRevision?: string;
}

/**
 * What one contributing source could establish, as of this capture.
 *
 * Carried beside the words because a target list is only as truthful as the
 * read behind it: a source that could not run the activity searches has to say
 * so next to its words rather than let their absence read as "not practised".
 */
export interface CapturedSourceObservation {
  readonly sourceId: VocabularySourceId;
  readonly label: string;
  readonly kind: VocabularySourceKind;
  readonly providerKind?: AnkiProviderKind;
  /** Whether Monosai re-reads this source on its own while it is open. */
  readonly automaticSync: boolean;
  /** When the source was last read completely; null when it never has been. */
  readonly refreshedAt: number | null;
  /** What that read proved; null when no read is stored for the source. */
  readonly practice: PracticeObservationBasis | null;
  readonly warnings: readonly string[];
}

/**
 * One consistent read of the current vocabulary and everything a selection
 * needs to explain itself.
 *
 * Taken in a single read transaction, so the expressions, the revision they
 * belong to, and the sources that proved them describe one moment. Reading them
 * separately would let a refresh land between two of the queries and produce a
 * selection whose words, evidence, and provenance came from different
 * vocabularies.
 */
export interface VocabularyCapture {
  readonly snapshot: VocabularySnapshot;
  readonly expressions: readonly VocabularyExpression[];
  /** Only sources currently included in the combined vocabulary. */
  readonly sources: readonly CapturedSourceObservation[];
}

export interface VocabularyRepository {
  /** Replaces the current vocabulary atomically; at most one snapshot remains. */
  commitSnapshot(commit: SnapshotCommit): Promise<Result<VocabularySnapshot, StorageError>>;
  /** Lists persisted vocabulary rows; the application keeps this at zero or one. */
  listSnapshots(): Promise<Result<readonly VocabularySnapshot[], StorageError>>;
  getActiveSnapshot(): Promise<Result<VocabularySnapshot | null, StorageError>>;
  getSnapshot(id: SnapshotId): Promise<Result<VocabularySnapshot | null, StorageError>>;
  /**
   * Reads the active vocabulary, its expressions, and its sources at one
   * revision. Null when no vocabulary has been built yet.
   */
  captureVocabulary(): Promise<Result<VocabularyCapture | null, StorageError>>;
  /** Lists canonical expression hashes for comparing two vocabulary contents. */
  listExpressionHashes(id: SnapshotId): Promise<Result<readonly string[], StorageError>>;
  /** Streams matcher input in bounded batches instead of one large array. */
  streamItems(id: SnapshotId, batchSize: number): AsyncIterable<readonly VocabularyItem[]>;
  listProvenance(id: SnapshotId): Promise<Result<readonly VocabularyProvenance[], StorageError>>;
  countStoriesUsingSnapshot(id: SnapshotId): Promise<Result<number, StorageError>>;
}
