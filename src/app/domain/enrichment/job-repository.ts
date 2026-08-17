import type { Result } from '../shared/result';
import type { JobId, ReadingId, SentenceId } from '../shared/ids';
import type { StorageError } from '../storage/storage-error';
import type { AssetJob, AssetJobKind, JobItemFailure, JobState } from './jobs';

export interface JobRepository {
  create(job: AssetJob): Promise<Result<AssetJob, StorageError>>;
  get(id: JobId): Promise<Result<AssetJob | null, StorageError>>;
  findActive(
    readingId: ReadingId,
    kind: AssetJobKind,
  ): Promise<Result<AssetJob | null, StorageError>>;
  /** Records one completed item and advances the job in a single transaction. */
  recordCompletion(id: JobId, sentenceId: SentenceId): Promise<Result<AssetJob, StorageError>>;
  recordFailure(id: JobId, failure: JobItemFailure): Promise<Result<AssetJob, StorageError>>;
  setState(id: JobId, state: JobState): Promise<Result<AssetJob, StorageError>>;
  /** Re-derives completion from stored cache records after a reload. */
  reconcile(
    id: JobId,
    completedSentenceIds: readonly SentenceId[],
  ): Promise<Result<AssetJob, StorageError>>;
}
