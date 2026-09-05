import type { ReadingId, SnapshotId, VocabularyItemId } from '../shared/ids';
import type { PreparationLayer } from '../enrichment/preparation';
import type { AnkiWordPriorityMode, VocabularyStrictness } from '../settings/settings';

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
  /**
   * The prompt versions in force when the story was written, all of them.
   *
   * Not a claim that each one ran: generation runs the story, repair, and
   * exception-review prompts, and an aid row carries the version its own
   * request used.
   */
  readonly promptVersions: Readonly<Record<string, string>>;
  /** Length selected when generation began; absent only on stories saved before ADR 0046. */
  readonly requestedSentenceCount?: number;
  /** Content repairs actually spent, 0 to 2. Format recovery is not counted. */
  readonly repairAttempts: number;
  readonly suggestedVocabularyItemIds: readonly VocabularyItemId[];
  /** The palette mode captured when this generation began. */
  readonly ankiWordPriorityMode: AnkiWordPriorityMode;
  /**
   * The strictness that set this run's repair budget. Absent on stories saved
   * before generation recorded it.
   */
  readonly vocabularyStrictness?: VocabularyStrictness;
  /**
   * The aid layers targeted **at generation time**, and nothing more.
   *
   * Targets are mutable after a story is saved (ADR 0047), so this is a record
   * of what was asked for on the day and never a statement about what the
   * reading declares now. `Reading.preparationTargets` is the live answer.
   * Absent on stories saved before generation recorded it.
   */
  readonly preparationTargets?: readonly PreparationLayer[];
  readonly createdAt: number;
}
