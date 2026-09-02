import type { Clock } from '../../../domain/shared/clock';
import { ok, type Result } from '../../../domain/shared/result';
import type { JobId, ReadingId, SentenceId } from '../../../domain/shared/ids';
import type {
  AssetJob,
  AssetJobKind,
  JobItemFailure,
  JobState,
} from '../../../domain/enrichment/jobs';
import { isTerminal } from '../../../domain/enrichment/jobs';
import type { JobRepository } from '../../../domain/enrichment/job-repository';
import { storageError, type StorageError } from '../../../domain/storage/storage-error';
import type { MonosaiDatabase } from '../monosai-db';
import { parseRecord } from '../record-validation';
import { ROW_VERSION } from '../schemas/common.schema';
import { assetJobRowSchema, type AssetJobRow } from '../schemas/job.schema';
import { StorageRuleViolation, runStorage, runStorageWithRules } from './storage-operation';

/**
 * Persisted batch jobs for whole-reading translation, grammar, and audio.
 *
 * Each completion is committed with the job update in one transaction, so a
 * reload can never report progress that its stored assets do not support.
 */
export class DexieJobRepository implements JobRepository {
  constructor(
    private readonly db: MonosaiDatabase,
    private readonly clock: Clock,
  ) {}

  async create(job: AssetJob): Promise<Result<AssetJob, StorageError>> {
    const written = await runStorage('assetJobs.add', () =>
      this.db.assetJobs.add({ ...job, v: ROW_VERSION }),
    );
    return written.ok ? ok(job) : written;
  }

  async get(id: JobId): Promise<Result<AssetJob | null, StorageError>> {
    const loaded = await runStorage('assetJobs.get', () => this.db.assetJobs.get(id));
    if (!loaded.ok) {
      return loaded;
    }
    if (!loaded.value) {
      return ok(null);
    }
    const parsed = parseRecord(assetJobRowSchema, loaded.value, 'assetJobs');
    return parsed.ok ? ok(toJob(parsed.value)) : parsed;
  }

  async findActive(
    readingId: ReadingId,
    kind: AssetJobKind,
  ): Promise<Result<AssetJob | null, StorageError>> {
    const loaded = await runStorage('assetJobs.findActive', () =>
      this.db.assetJobs.where('[readingId+kind]').equals([readingId, kind]).toArray(),
    );
    if (!loaded.ok) {
      return loaded;
    }
    const active = loaded.value.find((row) => !isTerminal(row.state));
    if (!active) {
      return ok(null);
    }
    const parsed = parseRecord(assetJobRowSchema, active, 'assetJobs');
    return parsed.ok ? ok(toJob(parsed.value)) : parsed;
  }

  recordCompletion(id: JobId, sentenceId: SentenceId): Promise<Result<AssetJob, StorageError>> {
    return this.mutate(id, 'assetJobs.recordCompletion', (job) => {
      if (job.completedSentenceIds.includes(sentenceId)) {
        return job;
      }
      const completedSentenceIds = [...job.completedSentenceIds, sentenceId];
      const failedItems = job.failedItems.filter((failure) => failure.sentenceId !== sentenceId);
      const outstanding = job.orderedSentenceIds.filter(
        (candidate) =>
          !completedSentenceIds.includes(candidate) &&
          !failedItems.some((failure) => failure.sentenceId === candidate),
      );
      return {
        ...job,
        completedSentenceIds,
        failedItems,
        state: outstanding.length === 0 && failedItems.length === 0 ? 'complete' : job.state,
      };
    });
  }

  recordFailure(id: JobId, failure: JobItemFailure): Promise<Result<AssetJob, StorageError>> {
    return this.mutate(id, 'assetJobs.recordFailure', (job) => ({
      ...job,
      failedItems: [
        ...job.failedItems.filter((item) => item.sentenceId !== failure.sentenceId),
        failure,
      ],
    }));
  }

  setState(id: JobId, state: JobState): Promise<Result<AssetJob, StorageError>> {
    return this.mutate(id, 'assetJobs.setState', (job) => ({ ...job, state }));
  }

  /**
   * Re-derives completion from stored cache records after a reload. Completed
   * work is never discarded, and a cancelled job stays cancelled.
   */
  reconcile(
    id: JobId,
    completedSentenceIds: readonly SentenceId[],
  ): Promise<Result<AssetJob, StorageError>> {
    return this.mutate(id, 'assetJobs.reconcile', (job) => {
      const merged = [...new Set([...job.completedSentenceIds, ...completedSentenceIds])];
      const outstanding = job.orderedSentenceIds.filter(
        (candidate) =>
          !merged.includes(candidate) &&
          !job.failedItems.some((failure) => failure.sentenceId === candidate),
      );
      const state: JobState =
        job.state === 'cancelled'
          ? 'cancelled'
          : outstanding.length === 0 && job.failedItems.length === 0
            ? 'complete'
            : job.state;
      return { ...job, completedSentenceIds: merged, state };
    });
  }

  private mutate(
    id: JobId,
    operation: string,
    project: (job: AssetJob) => AssetJob,
  ): Promise<Result<AssetJob, StorageError>> {
    return runStorageWithRules(operation, () =>
      this.db.transaction('rw', this.db.assetJobs, async () => {
        const row = await this.db.assetJobs.get(id);
        if (!row) {
          throw new StorageRuleViolation(storageError('not-found', 'That job no longer exists.'));
        }
        const parsed = parseRecord(assetJobRowSchema, row, 'assetJobs');
        if (!parsed.ok) {
          throw new StorageRuleViolation(parsed.error);
        }
        const next = { ...project(toJob(parsed.value)), updatedAt: this.clock.now() };
        await this.db.assetJobs.put({ ...next, v: ROW_VERSION });
        return next;
      }),
    );
  }
}

function toJob(row: AssetJobRow): AssetJob {
  const { v: _version, ...job } = row;
  return job;
}
