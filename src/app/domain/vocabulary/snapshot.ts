import type { SnapshotId, VocabularyItemId } from '../shared/ids';
import type { VocabularySourceId } from '../shared/ids';
import type { VocabularySourceKind } from './vocabulary-source';

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

export interface VocabularyItem {
  readonly id: VocabularyItemId;
  readonly snapshotId: SnapshotId;
  readonly visibleExpression: string;
  readonly canonicalExpression: string;
  readonly expressionHash: string;
  readonly analyzedSequence: readonly VocabularyToken[];
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

/** Minimum unique entries before story generation becomes available. */
export const GENERATION_SNAPSHOT_MINIMUM = 50;

export function meetsGenerationMinimum(snapshot: VocabularySnapshot | null): boolean {
  return snapshot !== null && snapshot.uniqueEntryCount >= GENERATION_SNAPSHOT_MINIMUM;
}
