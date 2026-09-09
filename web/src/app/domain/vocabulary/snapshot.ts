import type { SnapshotId, VocabularyItemId } from '../shared/ids';
import type { VocabularySourceId } from '../shared/ids';
import type { VocabularySourceKind } from './vocabulary-source';
import type { AnkiSchedulingSignals } from '../anki/scheduling-signals';
import type { PracticeEvidence } from '../anki/practice-evidence';

export type { AnkiProviderKind } from './vocabulary-source';

export interface SnapshotStats {
  readonly sourcesQueried: number;
  readonly entriesRead: number;
  readonly nonEmptyValues: number;
  readonly rejectedEmptyValues: number;
  readonly duplicateOccurrences: number;
  readonly uniqueExpressions: number;
  readonly sourceWarnings: readonly string[];
}

/** Complete current vocabulary result of one successful refresh. */
export interface VocabularySnapshot {
  readonly id: SnapshotId;
  /**
   * Which committed replacement this content came from.
   *
   * The id is deliberately stable so a generated story keeps one link to the
   * current vocabulary, which means it cannot say whether the words behind it
   * have changed. This can: every commit writes a new opaque token, including
   * one that changed only what a source proved about recent study. Anything
   * that captured a vocabulary compares this to find out that its capture is
   * stale, and a commit can require it to refuse to overwrite a newer one.
   */
  readonly revision: string;
  readonly createdAt: number;
  readonly status: 'complete';
  readonly uniqueEntryCount: number;
  readonly sourceIds: readonly VocabularySourceId[];
  readonly sourceKinds: readonly VocabularySourceKind[];
  readonly analyzerVersion: string;
  readonly normalizationVersion: string;
  readonly stats: SnapshotStats;
}

export interface VocabularyToken {
  readonly surface: string;
  readonly lemma?: string;
  readonly readingHiragana?: string;
}

export interface VocabularyItem extends AnkiSchedulingSignals {
  readonly id: VocabularyItemId;
  readonly snapshotId: SnapshotId;
  readonly visibleExpression: string;
  readonly canonicalExpression: string;
  readonly expressionHash: string;
  readonly analyzedSequence: readonly VocabularyToken[];
  /**
   * Recent study of this expression, merged over every note that produced it.
   *
   * Read against the contributing sources' own bases, which the caches hold:
   * absence here is only a real "not practised" for a source that could answer.
   */
  readonly practice?: PracticeEvidence;
}

/**
 * One canonical expression as the whole vocabulary knows it.
 *
 * The projection practice selection works from: identity, what the learner
 * sees, the items a matcher can recognize it through, and the evidence about
 * it. Deliberately without the analyzed token sequence, which is matcher input
 * and would make every capture carry the largest column in the table.
 */
export interface VocabularyExpression {
  readonly canonicalExpression: string;
  readonly visibleExpression: string;
  readonly expressionHash: string;
  /**
   * Every vocabulary item carrying this expression, captured with it.
   *
   * One today, because a snapshot merges exact duplicates. Kept as a list
   * because a selection has to stay explicable after a later refresh gives the
   * same word different item ids.
   */
  readonly itemIds: readonly VocabularyItemId[];
  readonly practice?: PracticeEvidence;
  /** Anki's own memory-state difficulty, on the 1-10 scale, where known. */
  readonly fsrsDifficulty?: number;
}

/** Reads one stored item as the expression it stands for. */
export function toVocabularyExpression(item: VocabularyItem): VocabularyExpression {
  return {
    canonicalExpression: item.canonicalExpression,
    visibleExpression: item.visibleExpression,
    expressionHash: item.expressionHash,
    itemIds: [item.id],
    ...(item.practice === undefined ? {} : { practice: item.practice }),
    ...(item.fsrsDifficulty === undefined ? {} : { fsrsDifficulty: item.fsrsDifficulty }),
  };
}

export interface VocabularyProvenance {
  readonly vocabularyItemId: VocabularyItemId;
  readonly sourceId: VocabularySourceId;
  readonly sourceKind: VocabularySourceKind;
  readonly sourceLabel: string;
  readonly deckName?: string;
  readonly noteTypeName?: string;
  readonly fieldName?: string;
  readonly sourceRecordId?: string;
}

/**
 * What the reader can classify against right now.
 *
 * `empty` is deliberately not folded into `none`: a snapshot with no words
 * still classifies, and it marks every content word as new. That is the state
 * the reader has to explain, and it looks nothing like never having connected a
 * source at all.
 */
export type VocabularyAvailability = 'none' | 'empty' | 'ready';

export function vocabularyAvailability(
  snapshot: VocabularySnapshot | null,
): VocabularyAvailability {
  if (snapshot === null) {
    return 'none';
  }
  return snapshot.uniqueEntryCount > 0 ? 'ready' : 'empty';
}

/** Minimum unique entries before story generation becomes available. */
export const GENERATION_SNAPSHOT_MINIMUM = 50;

export function meetsGenerationMinimum(snapshot: VocabularySnapshot | null): boolean {
  return snapshot !== null && snapshot.uniqueEntryCount >= GENERATION_SNAPSHOT_MINIMUM;
}
