import type { VocabularySourceId } from '../shared/ids';
import type { AnkiSchedulingSignals } from '../anki/scheduling-signals';

export type AnkiConnectionKind = 'desktop-connect' | 'android-connect';
export type AnkiProviderKind = AnkiConnectionKind | 'package';
export type VocabularySourceKind = 'anki-connect' | 'anki-package' | 'text-list';
export type DeckScope = 'deck-only' | 'deck-and-subdecks';

interface VocabularySourceBase {
  readonly id: VocabularySourceId;
  readonly kind: VocabularySourceKind;
  readonly label: string;
  /**
   * Whether this source contributes words to the combined vocabulary.
   *
   * The stored field keeps its original name, but the only thing it decides is
   * inclusion: excluding a source removes its words from the combined
   * vocabulary and is unrelated to whether the source is synced automatically.
   * Read it through `isIncludedInVocabulary` rather than by name.
   */
  readonly enabled: boolean;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly lastSyncedAt: number | null;
}

export interface AnkiVocabularySource extends VocabularySourceBase {
  readonly kind: 'anki-connect' | 'anki-package';
  readonly providerKind: AnkiProviderKind;
  readonly deckName: string;
  readonly deckScope: DeckScope;
  readonly noteTypeName: string;
  readonly expressionFieldName: string;
  /**
   * Whether Monosai re-reads this source on its own while it is open.
   *
   * Only meaningful for a live connection; always false for packages. Turning
   * it off stops background reads and changes nothing about what the source
   * contributes.
   */
  readonly automaticSync: boolean;
}

export interface TextListVocabularySource extends VocabularySourceBase {
  readonly kind: 'text-list';
  readonly content: string;
}

export type VocabularySource = AnkiVocabularySource | TextListVocabularySource;

export interface VocabularySourceCacheEntry extends AnkiSchedulingSignals {
  readonly rawValue?: string;
  readonly sourceRecordId?: string;
}

/** Last complete read of one source. Partial reads are never persisted. */
export interface VocabularySourceCache {
  readonly sourceId: VocabularySourceId;
  readonly refreshedAt: number;
  readonly entries: readonly VocabularySourceCacheEntry[];
  readonly warnings: readonly string[];
}

export function isAnkiSource(source: VocabularySource): source is AnkiVocabularySource {
  return source.kind === 'anki-connect' || source.kind === 'anki-package';
}

/** Whether the source's words are part of the combined vocabulary. */
export function isIncludedInVocabulary(source: VocabularySource): boolean {
  return source.enabled;
}

/**
 * Whether a source can be re-read on demand.
 *
 * A package is a file that was read once and a pasted list is already local, so
 * only a live connection has anything to fetch again.
 */
export function supportsManualSync(source: VocabularySource): source is AnkiVocabularySource & {
  readonly kind: 'anki-connect';
  readonly providerKind: AnkiConnectionKind;
} {
  return source.kind === 'anki-connect' && source.providerKind !== 'package';
}

export function isAutomaticAnkiSource(source: VocabularySource): source is AnkiVocabularySource & {
  readonly kind: 'anki-connect';
  readonly providerKind: AnkiConnectionKind;
} {
  return source.kind === 'anki-connect' && isIncludedInVocabulary(source) && source.automaticSync;
}
