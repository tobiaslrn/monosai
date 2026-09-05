import type { SnapshotId, VocabularyItemId } from '../shared/ids';
import type { VocabularyItem, VocabularyProvenance, VocabularyToken } from '../vocabulary/snapshot';
import { mergeSchedulingSignals, type AnkiSchedulingSignals } from './scheduling-signals';

/** One accepted field value with everything needed to become a vocabulary item. */
export interface PreparedEntry extends AnkiSchedulingSignals {
  readonly provenance: Omit<VocabularyProvenance, 'vocabularyItemId'>;
  readonly visibleExpression: string;
  readonly canonicalExpression: string;
  readonly expressionHash: string;
  readonly analyzedSequence: readonly VocabularyToken[];
}

export interface MergeResult {
  readonly items: readonly VocabularyItem[];
  readonly provenance: readonly VocabularyProvenance[];
  /** Accepted values that collapsed into an entry already seen. */
  readonly duplicateOccurrences: number;
}

function provenanceKey(itemId: VocabularyItemId, entry: PreparedEntry): string {
  return `${itemId} ${entry.provenance.sourceId} ${entry.provenance.sourceRecordId ?? ''}`;
}

/**
 * Merges exact canonical duplicates into one item while keeping every source
 * that contributed it.
 *
 * Only an identical canonical expression merges. Two spellings of the same word
 * stay two items even when the dictionary would give them one lemma, because
 * the learner reviewed those spellings separately and the matcher is allowed to
 * reach each of them through its own normalization rules rather than by having
 * them collapsed here.
 *
 * The first occurrence supplies the visible expression and the analyzed
 * sequence, so the merge is stable in input order rather than dependent on how
 * many mappings happened to contain the entry.
 */
export function mergeEntries(
  entries: readonly PreparedEntry[],
  snapshot: SnapshotId,
  nextItemId: () => VocabularyItemId,
): MergeResult {
  const itemsByHash = new Map<string, VocabularyItem>();
  const provenance: VocabularyProvenance[] = [];
  const seenProvenance = new Set<string>();
  let duplicateOccurrences = 0;

  for (const entry of entries) {
    let item = itemsByHash.get(entry.expressionHash);
    if (item === undefined) {
      item = {
        id: nextItemId(),
        snapshotId: snapshot,
        visibleExpression: entry.visibleExpression,
        canonicalExpression: entry.canonicalExpression,
        expressionHash: entry.expressionHash,
        analyzedSequence: entry.analyzedSequence,
        ...mergeSchedulingSignals(undefined, entry),
      };
      itemsByHash.set(entry.expressionHash, item);
    } else {
      duplicateOccurrences += 1;
      const scheduling = mergeSchedulingSignals(item, entry);
      item = { ...item, ...scheduling };
      itemsByHash.set(entry.expressionHash, item);
    }

    const key = provenanceKey(item.id, entry);
    if (seenProvenance.has(key)) {
      continue;
    }
    seenProvenance.add(key);
    provenance.push({ vocabularyItemId: item.id, ...entry.provenance });
  }

  return { items: [...itemsByHash.values()], provenance, duplicateOccurrences };
}
