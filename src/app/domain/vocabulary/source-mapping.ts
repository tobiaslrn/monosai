import type { SourceMappingId } from '../shared/ids';
import type { AnkiProviderKind } from './snapshot';

/** Deck scope stored with the mapping so query semantics stay reproducible. */
export type DeckScope = 'deck-only' | 'deck-and-subdecks';

export interface SourceMapping {
  readonly id: SourceMappingId;
  readonly providerKind: AnkiProviderKind;
  readonly deckName: string;
  readonly deckScope: DeckScope;
  readonly noteTypeName: string;
  readonly expressionFieldName: string;
  readonly enabled: boolean;
  readonly createdAt: number;
  readonly updatedAt: number;
}
