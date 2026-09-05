import type { AnkiCatalog } from '../anki/catalog';
import { containsJapanese } from '../reading/import-text';

export interface AnkiFieldSample {
  readonly deckName: string;
  readonly noteTypeName: string;
  readonly fields: Readonly<Record<string, string>>;
}

export interface AnkiMappingSuggestion {
  readonly deckName: string;
  readonly noteTypeName: string;
  readonly expressionFieldName: string;
}

/** Samples are visible text. Require predominantly Japanese, never catalogue order. */
export function suggestAnkiMapping(
  catalog: AnkiCatalog,
  samples: readonly AnkiFieldSample[],
): AnkiMappingSuggestion | null {
  let best: AnkiMappingSuggestion | null = null;
  let bestScore = 0.5;
  for (const deck of catalog.decks) {
    for (const noteType of catalog.noteTypes) {
      const notes = samples.filter(
        (sample) => sample.deckName === deck.name && sample.noteTypeName === noteType.name,
      );
      if (notes.length === 0) continue;
      for (const field of noteType.fieldNames) {
        const score =
          notes.reduce((total, note) => {
          const characters = Array.from(note.fields[field] ?? '').filter((character) =>
              /[\p{L}\p{N}]/u.test(character),
            );
            return (
              total +
              (characters.length === 0
                ? 0
                : characters.filter(containsJapanese).length / characters.length)
            );
          }, 0) / notes.length;
        if (score > bestScore) {
          bestScore = score;
          best = { deckName: deck.name, noteTypeName: noteType.name, expressionFieldName: field };
        }
      }
    }
  }
  return best;
}
