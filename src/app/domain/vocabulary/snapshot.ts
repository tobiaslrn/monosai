import type { SnapshotId, VocabularyItemId } from '../shared/ids';

export type AnkiProviderKind = 'desktop-connect' | 'android-connect' | 'package';

export interface SnapshotStats {
  readonly mappingsQueried: number;
  readonly reviewedEligibleNotes: number;
  readonly nonEmptyValues: number;
  readonly rejectedEmptyValues: number;
  readonly duplicateOccurrences: number;
  readonly uniqueExpressions: number;
  readonly providerWarnings: readonly string[];
}

/** Immutable, append-only result of one successful refresh. */
export interface VocabularySnapshot {
  readonly id: SnapshotId;
  readonly createdAt: number;
  readonly status: 'complete';
  readonly uniqueEntryCount: number;
  readonly mappingIds: readonly string[];
  readonly providerKinds: readonly AnkiProviderKind[];
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
  readonly sourceMappingId: string;
  readonly deckName: string;
  readonly noteTypeName: string;
  readonly fieldName: string;
  readonly sourceNoteId?: string;
}

/** Minimum unique entries before story generation becomes available. */
export const GENERATION_SNAPSHOT_MINIMUM = 50;

export function meetsGenerationMinimum(snapshot: VocabularySnapshot | null): boolean {
  return snapshot !== null && snapshot.uniqueEntryCount >= GENERATION_SNAPSHOT_MINIMUM;
}
