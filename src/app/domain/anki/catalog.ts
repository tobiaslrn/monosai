/**
 * A deck the provider offers. `hasChildren` exists so the mapping editor can
 * offer an "and its subdecks" choice only where subdecks actually exist, and
 * label it explicitly when it does.
 */
export interface AnkiDeck {
  readonly name: string;
  readonly hasChildren: boolean;
}

export interface AnkiNoteType {
  readonly name: string;
  readonly fieldNames: readonly string[];
}

/** Everything a mapping can be built from. Dropdown values come only from here. */
export interface AnkiCatalog {
  readonly decks: readonly AnkiDeck[];
  readonly noteTypes: readonly AnkiNoteType[];
}

export function findDeck(catalog: AnkiCatalog, name: string): AnkiDeck | null {
  return catalog.decks.find((deck) => deck.name === name) ?? null;
}

export function findNoteType(catalog: AnkiCatalog, name: string): AnkiNoteType | null {
  return catalog.noteTypes.find((noteType) => noteType.name === name) ?? null;
}
