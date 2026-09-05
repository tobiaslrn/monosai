import type { AnkiCatalog } from '../../../domain/anki/catalog';
import type { AnkiError } from '../../../domain/anki/anki-error';
import { ok, type Result } from '../../../domain/shared/result';
import type { AnkiFieldSample } from '../../../domain/vocabulary/suggest-anki-mapping';
import { DomMarkupTextExtractor } from '../dom-markup-text';
import type { AnkiConnectClient } from './connect-client';
import { escapeTerm } from './connect-search';

/** Bounded samples shared by both live providers. */
export async function sampleConnectFields(
  client: AnkiConnectClient,
  catalog: AnkiCatalog,
  signal?: AbortSignal,
): Promise<Result<readonly AnkiFieldSample[], AnkiError>> {
  const samples: AnkiFieldSample[] = [];
  const extractor = new DomMarkupTextExtractor();
  // Cap both request count and note bodies, even for a collection with hundreds of types.
  for (const noteType of catalog.noteTypes.slice(0, 20)) {
    const found = await client.findCards(`"note:${escapeTerm(noteType.name)}"`, signal);
    if (!found.ok) return found;
    const cards = await client.cardsInfo(found.value.slice(0, 8), signal);
    if (!cards.ok) return cards;
    const notes = await client.notesInfo(
      [...new Set(cards.value.map((card) => card.note))],
      signal,
    );
    if (!notes.ok) return notes;
    for (const note of notes.value) {
      if (note.modelName !== noteType.name) continue;
      for (const deckName of new Set(
        cards.value.filter((card) => card.note === note.noteId).map((card) => card.deckName),
      )) {
        samples.push({
          deckName,
          noteTypeName: note.modelName,
          fields: Object.fromEntries(
            Object.entries(note.fields).map(([name, field]) => [
              name,
              extractor.toVisibleText(field.value),
            ]),
          ),
        });
      }
    }
  }
  return ok(samples);
}
