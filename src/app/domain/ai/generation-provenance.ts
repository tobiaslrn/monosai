import type { ReadingId, SnapshotId, VocabularyItemId } from '../shared/ids';

/**
 * Everything needed to explain or reproduce one generated story.
 *
 * The shape matches `generationProvenanceRowSchema` exactly, so nothing is
 * lost or invented in the mapper. Assembled prompts are deliberately absent:
 * the versions plus the captured profile, policy, and snapshot say which
 * instructions ran, and storing the full text would be a second copy of the
 * learner's own words.
 */
export interface GenerationProvenance {
  /** Own identifier; the reading points at it by `generationProvenanceId`. */
  readonly id: string;
  readonly readingId: ReadingId;
  readonly snapshotId: SnapshotId;
  /** Content-addressed capture id, which is also its profile hash. */
  readonly grammarProfileSnapshotId: string;
  /** Empty when no exception policy was configured when the story was made. */
  readonly exceptionPolicyHash: string;
  readonly modelId: string;
  readonly promptVersions: Readonly<Record<string, string>>;
  /** Content repairs actually spent, 0 to 2. Format recovery is not counted. */
  readonly repairAttempts: number;
  readonly suggestedVocabularyItemIds: readonly VocabularyItemId[];
  readonly createdAt: number;
}

export const MAX_REPAIR_ATTEMPTS = 2;
