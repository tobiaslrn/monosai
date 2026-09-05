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
  /**
   * Every non-terminal job row, across every reading.
   *
   * The lane's work list. Deliberately not derived from targets and summaries:
   * those cannot see a layer that failed, so a lane driven by them would pick
   * the same reading again on every pass.
   */
  listActive(): Promise<Result<readonly AssetJob[], StorageError>>;
  /**
   * Claims one reading's active jobs for one lane, atomically.
   *
   * Fails with `conflict` while another owner's claim is still live, which is
   * how a second tab learns to leave this reading alone. A claim whose
   * heartbeat has gone stale is taken over rather than waited on, so a tab
   * closed mid-run does not strand a reading forever.
   */
  claimReading(
    readingId: ReadingId,
    ownerId: string,
    now: number,
  ): Promise<Result<readonly AssetJob[], StorageError>>;
  /** Refreshes this owner's claim; silently does nothing once it has been lost. */
  heartbeatReading(
    readingId: ReadingId,
    ownerId: string,
    now: number,
  ): Promise<Result<void, StorageError>>;
  /** Drops this owner's claim, so any lane may take the reading next. */
  releaseReading(readingId: ReadingId, ownerId: string): Promise<Result<void, StorageError>>;
  /** Re-derives completion from stored cache records after a reload. */
  reconcile(
    id: JobId,
    completedSentenceIds: readonly SentenceId[],
  ): Promise<Result<AssetJob, StorageError>>;
}
