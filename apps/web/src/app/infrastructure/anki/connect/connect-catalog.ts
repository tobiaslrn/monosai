import type { AnkiError } from '../../../domain/anki/anki-error';
import type { AnkiCatalog, AnkiNoteType } from '../../../domain/anki/catalog';
import { ok, type Result } from '../../../domain/shared/result';
import type { AnkiConnectClient } from './connect-client';

/**
 * Builds the discovery catalog from an AnkiConnect endpoint.
 *
 * Field discovery is one request per note type, which is what the protocol
 * offers. A note type whose fields cannot be read is kept with an empty field
 * list rather than dropped: it still has to appear in the picker so a mapping
 * that points at it reads as stale rather than silently vanishing.
 */
export async function buildCatalog(
  client: AnkiConnectClient,
  signal?: AbortSignal,
): Promise<Result<AnkiCatalog, AnkiError>> {
  const deckNames = await client.deckNames(signal);
  if (!deckNames.ok) {
    return deckNames;
  }

  const modelNames = await client.modelNames(signal);
  if (!modelNames.ok) {
    return modelNames;
  }

  const noteTypes: AnkiNoteType[] = [];
  for (const name of modelNames.value) {
    const fields = await client.modelFieldNames(name, signal);
    if (!fields.ok) {
      if (fields.error.code === 'cancelled') {
        return fields;
      }
      noteTypes.push({ name, fieldNames: [] });
      continue;
    }
    noteTypes.push({ name, fieldNames: [...fields.value] });
  }

  return ok({
    decks: deckNames.value.map((name) => ({
      name,
      hasChildren: deckNames.value.some((other) => other.startsWith(`${name}::`)),
    })),
    noteTypes,
  });
}
