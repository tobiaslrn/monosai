import type { SentenceId } from '../shared/ids';
import type { AssetJob, AssetJobKind } from './jobs';
import { isTerminal } from './jobs';
import type { Reading } from '../reading/reading';
import { isComplete } from '../reading/summaries';

/** Reading-aid layers that a reading may ask the preparation pipeline to provide. */
export type PreparationLayer = 'english' | 'grammar' | 'audio';

export const PREPARATION_ORDER: readonly PreparationLayer[] = ['english', 'grammar', 'audio'];

export function jobKindFor(layer: PreparationLayer): AssetJobKind {
  switch (layer) {
    case 'english':
      return 'translate-reading';
    case 'grammar':
      return 'analyze-reading';
    case 'audio':
      return 'prepare-audio';
  }
}

/** Targeted layers that still lack a reading-wide result. */
export function missingLayers(reading: Reading): readonly PreparationLayer[] {
  return reading.preparationTargets.filter((layer) => {
    switch (layer) {
      case 'english':
        return !isComplete(reading.translationSummary);
      case 'grammar':
        return (
          reading.grammarSummary.state === 'not-requested' ||
          reading.grammarSummary.state === 'partial'
        );
      case 'audio':
        return !isComplete(reading.audioSummary);
    }
  });
}

export function isReady(reading: Reading): boolean {
  return missingLayers(reading).length === 0;
}

/** Work rows the lane can run, independent of mutable reading summaries. */
export function schedulable(rows: readonly AssetJob[]): readonly AssetJob[] {
  const orderByKind = new Map(
    PREPARATION_ORDER.map((layer, index) => [jobKindFor(layer), index] as const),
  );
  return rows
    .filter((row) => !isTerminal(row.state))
    .sort((left, right) => (orderByKind.get(left.kind) ?? 0) - (orderByKind.get(right.kind) ?? 0));
}

/**
 * Sentences with no stored aid under any configuration.
 *
 * `sentenceIdsWithStoredAid` is the set that owns a row; `cacheKeys` is every
 * sentence's key under one configuration — any configuration will do, because
 * only the sentence-dependent half of a key varies within a reading. Two
 * sentences that share a key here would share a row under every configuration,
 * so one of them owning a row covers both.
 *
 * That indirection is what keeps this stable. A repeated sentence is stored
 * once, under whichever twin was written last, and asking by sentence id alone
 * would report the other twin unprepared forever, re-preparing the pair on
 * every reconciliation. Asking by content hash alone would make the opposite
 * mistake: two identical sentences with different neighbours have different
 * keys and genuinely need separate rows.
 */
export function sentencesWithoutStoredAid(
  cacheKeys: ReadonlyMap<SentenceId, string>,
  sentenceIdsWithStoredAid: readonly SentenceId[],
): readonly SentenceId[] {
  const storedKeys = new Set<string>();
  for (const sentenceId of sentenceIdsWithStoredAid) {
    const key = cacheKeys.get(sentenceId);
    if (key !== undefined) {
      storedKeys.add(key);
    }
  }
  return [...cacheKeys].filter(([, key]) => !storedKeys.has(key)).map(([sentenceId]) => sentenceId);
}
