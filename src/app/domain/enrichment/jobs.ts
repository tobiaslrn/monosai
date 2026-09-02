import type { JobId, ReadingId, SentenceId } from '../shared/ids';

export type AssetJobKind = 'translate-reading' | 'analyze-reading' | 'prepare-audio';
export type JobState = 'queued' | 'running' | 'paused' | 'cancelled' | 'failed' | 'complete';

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
