import type { JobId, ReadingId, SentenceId } from '../shared/ids';

export type AssetJobKind = 'translate-reading' | 'analyze-reading' | 'prepare-audio';
export type JobState = 'queued' | 'running' | 'paused' | 'cancelled' | 'failed' | 'complete';

/**
 * Which lane is working a reading's jobs, and when it last said so.
 *
 * One preparation pipeline runs per reading, across every tab. The claim lives
 * on the job rows rather than in memory because the tabs share a database and
 * nothing else; a tab that is closed mid-run leaves its claim behind, so a
 * claim older than `CLAIM_STALE_AFTER_MS` is reclaimable.
 */
export interface JobClaim {
  readonly ownerId: string;
  readonly heartbeatAt: number;
}

/** How long a claim survives without a heartbeat before another lane may take it. */
export const CLAIM_STALE_AFTER_MS = 60_000;

export function isClaimLive(claim: JobClaim, now: number): boolean {
  return now - claim.heartbeatAt < CLAIM_STALE_AFTER_MS;
}

export interface JobItemFailure {
  readonly sentenceId: SentenceId;
  readonly errorCode: string;
  readonly failedAt: number;
}

/**
 * Persisted batch job. Progress is reconstructed from the record plus existing
 * cache entries after a reload.
 */
export interface AssetJob {
  readonly id: JobId;
  readonly kind: AssetJobKind;
  readonly readingId: ReadingId;
  readonly state: JobState;
  readonly orderedSentenceIds: readonly SentenceId[];
  readonly completedSentenceIds: readonly SentenceId[];
  readonly failedItems: readonly JobItemFailure[];
  readonly configFingerprint: string;
  /** Absent while no lane is working this reading, which is the resting state. */
  readonly claim?: JobClaim;
  readonly createdAt: number;
  readonly updatedAt: number;
}

const TERMINAL_STATES: readonly JobState[] = ['cancelled', 'failed', 'complete'];

export function isTerminal(state: JobState): boolean {
  return TERMINAL_STATES.includes(state);
}

export function remainingSentenceIds(job: AssetJob): readonly SentenceId[] {
  const done = new Set(job.completedSentenceIds);
  const failed = new Set(job.failedItems.map((failure) => failure.sentenceId));
  return job.orderedSentenceIds.filter((id) => !done.has(id) && !failed.has(id));
}
