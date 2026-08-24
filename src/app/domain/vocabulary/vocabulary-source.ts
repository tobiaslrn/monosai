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
  /** Only meaningful for a live connection; always false for packages. */
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

export function isAutomaticAnkiSource(source: VocabularySource): source is AnkiVocabularySource & {
  readonly kind: 'anki-connect';
  readonly providerKind: AnkiConnectionKind;
} {
  return source.kind === 'anki-connect' && source.enabled && source.automaticSync;
}
