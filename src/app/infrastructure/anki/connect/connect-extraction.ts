import { ankiError } from '../../../domain/anki/anki-error';
import type { AnkiExtractionEvent } from '../../../domain/anki/anki-provider';
import type { SourceMapping } from '../../../domain/vocabulary/source-mapping';
import type { AnkiConnectClient } from './connect-client';
import { batched, searchFor } from './connect-search';

/** Ids per `cardsInfo` or `notesInfo` request when the endpoint states no limit. */
export const DEFAULT_BATCH_SIZE = 200;

/**
 * Streams the reviewed field values for one mapping.
 *
 * Eligibility is decided from each card's own `reps`, not from a search term
 * like `-is:new`. A card that was studied and later forgotten returns to the new
 * queue while keeping its review count, so the search would drop vocabulary the
 * learner really has reviewed — and the specification's rule is review
 * evidence, not current queue.
 *
 * Deck membership is confirmed against the `deckName` each card reports rather
 * than trusted from the query alone, so a provider whose search semantics
 * differ cannot widen a mapping's scope unnoticed.
 */
export async function* extractMapping(
  client: AnkiConnectClient,
  mapping: SourceMapping,
  batchSize: number,
  signal?: AbortSignal,
): AsyncGenerator<AnkiExtractionEvent> {
  const found = await client.findCards(searchFor(mapping), signal);
  if (!found.ok) {
    yield { kind: 'failed', error: found.error };
    return;
  }

  const eligibleNoteIds: number[] = [];
  const seenNotes = new Set<number>();
  let examined = 0;

  for (const batch of batched(found.value, batchSize)) {
    if (signal?.aborted === true) {
      yield { kind: 'failed', error: ankiError('cancelled', 'The refresh was cancelled.') };
      return;
    }

    const cards = await client.cardsInfo(batch, signal);
    if (!cards.ok) {
      yield { kind: 'failed', error: cards.error };
      return;
    }

    for (const card of cards.value) {
      examined += 1;
      if (card.reps <= 0 || !inScope(card.deckName, mapping) || seenNotes.has(card.note)) {
        continue;
      }
      seenNotes.add(card.note);
      eligibleNoteIds.push(card.note);
    }

    yield { kind: 'progress', mappingId: mapping.id, examined, total: found.value.length };
  }

  for (const batch of batched(eligibleNoteIds, batchSize)) {
    if (signal?.aborted === true) {
      yield { kind: 'failed', error: ankiError('cancelled', 'The refresh was cancelled.') };
      return;
    }

    const notes = await client.notesInfo(batch, signal);
    if (!notes.ok) {
      yield { kind: 'failed', error: notes.error };
      return;
    }

    for (const note of notes.value) {
      // The search asked for one note type; a mismatch means the endpoint's
      // query semantics are not what this adapter assumes, and quietly keeping
      // the note would put another note type's field into the snapshot.
      if (note.modelName !== mapping.noteTypeName) {
        continue;
      }
      // A note can be missing the mapped field entirely. Zod's record type
      // says every key is present, so the lookup is widened to say otherwise.
      const fields: Record<string, { value: string } | undefined> = note.fields;
      const field = fields[mapping.expressionFieldName];
      yield {
        kind: 'entry',
        entry: {
          sourceMappingId: mapping.id,
          sourceNoteId: String(note.noteId),
          ...(field === undefined ? {} : { rawFieldValue: field.value }),
        },
      };
    }
  }
}

function inScope(deckName: string, mapping: SourceMapping): boolean {
  if (deckName === mapping.deckName) {
    return true;
  }
  return mapping.deckScope === 'deck-and-subdecks' && deckName.startsWith(`${mapping.deckName}::`);
}
