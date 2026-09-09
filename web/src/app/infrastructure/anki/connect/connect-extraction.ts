import { ankiError } from '../../../domain/anki/anki-error';
import type { AnkiExtractionEvent } from '../../../domain/anki/anki-provider';
import type { SourceMapping } from '../../../domain/vocabulary/source-mapping';
import type { AnkiConnectClient, ReviewsOfCards } from './connect-client';
import { batched, searchFor } from './connect-search';
import {
  mergeSchedulingSignals,
  isEligibleReviewedCard,
  schedulingSignalsFromCard,
  type AnkiSchedulingSignals,
} from '../../../domain/anki/scheduling-signals';

/** Ids per `cardsInfo` or `notesInfo` request when the endpoint states no limit. */
export const DEFAULT_BATCH_SIZE = 200;

export interface ExtractionOptions {
  /**
   * Whether this endpoint can serve `getReviewsOfCards`.
   *
   * The desktop add-on can; the first-party Android bridge cannot, because
   * AnkiDroid's content provider exposes no review log at all. Asking anyway
   * would spend one guaranteed-refused request and one misleading warning per
   * refresh, so the caller states what its endpoint is rather than discovering
   * it every time.
   */
  readonly readsReviewHistory?: boolean;
}

/**
 * Streams the reviewed field values for one mapping.
 *
 * Eligibility is decided from each card's own review evidence and queue, not
 * from a search term like `-is:new`. A card that was studied and later forgotten
 * returns to the new queue while keeping its review count, so the search would
 * drop vocabulary the learner really has reviewed. Explicitly suspended cards
 * are the exception: the learner removed them from this vocabulary on purpose.
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
  options: ExtractionOptions = {},
): AsyncGenerator<AnkiExtractionEvent> {
  const found = await client.findCards(searchFor(mapping), signal);
  if (!found.ok) {
    yield { kind: 'failed', error: found.error };
    return;
  }

  const schedulingByNote = new Map<number, AnkiSchedulingSignals>();
  let examined = 0;
  // Turned off for the rest of the run by the first endpoint that cannot answer,
  // so one unsupported action costs one request rather than one per batch.
  let readsReviewHistory = options.readsReviewHistory ?? false;
  let warnedAboutReviews = false;

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

    const eligible = cards.value.filter(
      (card) => isEligibleReviewedCard(card.reps, card.queue) && inScope(card.deckName, mapping),
    );
    examined += cards.value.length;

    // Asked only for the cards that survived eligibility, and only inside this
    // batch, so the review log is never fetched for the whole collection.
    let firstReviewedByCard = new Map<number, number>();
    if (readsReviewHistory && eligible.length > 0) {
      const reviews = await client.getReviewsOfCards(
        eligible.map((card) => card.cardId),
        signal,
      );
      if (reviews.ok) {
        firstReviewedByCard = firstReviewTimes(reviews.value);
      } else if (reviews.error.code === 'cancelled') {
        yield { kind: 'failed', error: reviews.error };
        return;
      } else {
        // An optional enrichment signal is not worth failing a refresh over:
        // without it the palette falls back to the card interval, and every
        // word the learner reviewed is still in the vocabulary either way.
        readsReviewHistory = false;
        if (!warnedAboutReviews) {
          warnedAboutReviews = true;
          yield {
            kind: 'warning',
            message:
              'Anki could not provide review dates, so recently learned words are estimated from card intervals.',
          };
        }
      }
    }

    for (const card of eligible) {
      const firstReviewedAt = firstReviewedByCard.get(card.cardId);
      const signals = schedulingSignalsFromCard({
        reps: card.reps,
        lapses: card.lapses ?? undefined,
        factor: card.factor ?? undefined,
        intervalDays: card.interval ?? undefined,
        ...(firstReviewedAt === undefined ? {} : { firstReviewedAt }),
      });
      schedulingByNote.set(
        card.note,
        mergeSchedulingSignals(schedulingByNote.get(card.note), signals),
      );
    }

    yield { kind: 'progress', mappingId: mapping.id, examined, total: found.value.length };
  }

  const eligibleNoteIds = [...schedulingByNote.keys()];
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
          ...schedulingByNote.get(note.noteId),
        },
      };
    }
  }
}

/**
 * Reduces each card's review log to the moment the learner first answered it.
 *
 * Entries with `ease` of zero are manual reschedules rather than answers, and
 * enabling FSRS writes one for every card in the collection, so counting them
 * would date the whole vocabulary to the day the learner changed scheduler.
 */
function firstReviewTimes(reviews: ReviewsOfCards): Map<number, number> {
  const firstByCard = new Map<number, number>();
  for (const [cardId, entries] of Object.entries(reviews)) {
    const answered = entries.filter((entry) => entry.ease > 0);
    if (answered.length === 0) {
      continue;
    }
    firstByCard.set(
      Number(cardId),
      answered.reduce((earliest, entry) => Math.min(earliest, entry.id), Number.POSITIVE_INFINITY),
    );
  }
  return firstByCard;
}

function inScope(deckName: string, mapping: SourceMapping): boolean {
  if (deckName === mapping.deckName) {
    return true;
  }
  return mapping.deckScope === 'deck-and-subdecks' && deckName.startsWith(`${mapping.deckName}::`);
}
