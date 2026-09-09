import { ankiError } from '../../../domain/anki/anki-error';
import type { AnkiExtractionEvent } from '../../../domain/anki/anki-provider';
import type { SourceMapping } from '../../../domain/vocabulary/source-mapping';
import type { AnkiConnectClient, ReviewsOfCards } from './connect-client';
import { batched, searchFor } from './connect-search';
import { captureActivity, type ActivityPools } from './connect-activity';
import {
  mergeSchedulingSignals,
  isEligibleReviewedCard,
  schedulingSignalsFromCard,
  type AnkiSchedulingSignals,
} from '../../../domain/anki/scheduling-signals';
import {
  isLearningCardType,
  mergePracticeEvidence,
  SHORT_INTERVAL_DAYS,
  type EvidenceAvailability,
  type PracticeEvidence,
  type PracticeWindowDays,
} from '../../../domain/anki/practice-evidence';
import type { CardInfo } from './connect-client';

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

  const activity = await captureActivity(client, mapping, signal);
  if (activity.cancelled !== undefined) {
    yield { kind: 'failed', error: activity.cancelled };
    return;
  }

  const schedulingByNote = new Map<number, AnkiSchedulingSignals>();
  const practiceByNote = new Map<number, PracticeEvidence>();
  // Availability of a column is proved by a value arriving, not by asking: the
  // wire cannot distinguish a build that never published the column from a
  // collection where every card happens to leave it null, and claiming the
  // stronger of the two would let an absent signal read as a settled "no".
  let sawCardType = false;
  let sawFsrsDifficulty = false;
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
      (card) => isEligibleReviewedCard(card.reps, card.queue) && inScope(card, mapping),
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
        fsrsDifficulty: card.fsrsDifficulty ?? undefined,
        lastReviewedAt: card.lastReviewedAt ?? undefined,
        ...(firstReviewedAt === undefined ? {} : { firstReviewedAt }),
      });
      schedulingByNote.set(
        card.note,
        mergeSchedulingSignals(schedulingByNote.get(card.note), signals),
      );
      sawCardType ||= card.cardType !== undefined && card.cardType !== null;
      sawFsrsDifficulty ||= card.fsrsDifficulty !== undefined && card.fsrsDifficulty !== null;
      practiceByNote.set(
        card.note,
        mergePracticeEvidence(
          practiceByNote.get(card.note),
          practiceFromCard(card, activity.pools),
        ),
      );
    }

    yield { kind: 'progress', mappingId: mapping.id, examined, total: found.value.length };
  }

  yield {
    kind: 'observed',
    mappingId: mapping.id,
    basis: {
      recentAnswers: activity.recentAnswers,
      recentDifficulty: activity.recentDifficulty,
      learningState: observed(sawCardType),
      fsrsDifficulty: observed(sawFsrsDifficulty),
      windowBasis: 'anki-study-days',
      observedAt: Date.now(),
    },
  };

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
          ...practiceOf(practiceByNote.get(note.noteId)),
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

/**
 * Reads one card's membership in the pools this capture established.
 *
 * The correlated flags are decided from this card alone. A note whose siblings
 * disagree is common - one template answered this morning, another settled for
 * months - and combining one sibling's recent answer with another's learning
 * state would assert something true of no card the learner actually has.
 */
function practiceFromCard(card: CardInfo, pools: ActivityPools): PracticeEvidence {
  const answeredWithinDays = narrowestWindow(card.cardId, pools);
  const recent = answeredWithinDays !== undefined;
  const interval = card.interval ?? undefined;
  return {
    ...(answeredWithinDays === undefined ? {} : { answeredWithinDays }),
    ...(pools.again7.has(card.cardId) ? { answeredAgain: true } : {}),
    ...(pools.hard7.has(card.cardId) ? { answeredHard: true } : {}),
    ...(recent && isLearningCardType(card.cardType ?? undefined)
      ? { recentlyAnsweredWhileLearning: true }
      : {}),
    // A negative interval is Anki storing seconds for a card inside a learning
    // step, which is shorter than any day count rather than longer.
    ...(recent && interval !== undefined && interval <= SHORT_INTERVAL_DAYS
      ? { recentlyAnsweredWithShortInterval: true }
      : {}),
  };
}

function narrowestWindow(cardId: number, pools: ActivityPools): PracticeWindowDays | undefined {
  if (pools.answered1.has(cardId)) {
    return 1;
  }
  if (pools.answered3.has(cardId)) {
    return 3;
  }
  return pools.answered7.has(cardId) ? 7 : undefined;
}

function practiceOf(practice: PracticeEvidence | undefined): { practice?: PracticeEvidence } {
  return practice === undefined || Object.keys(practice).length === 0 ? {} : { practice };
}

function observed(seen: boolean): EvidenceAvailability {
  return seen ? 'available' : 'unsupported';
}

/**
 * Confirms the card belongs to the mapping's deck.
 *
 * A filtered deck moves a card without changing where it belongs, so its home
 * deck decides. Checking only the current deck would drop exactly the cards the
 * learner is studying right now, which is the opposite of what recent practice
 * is for.
 */
function inScope(
  card: Pick<CardInfo, 'deckName' | 'originalDeckName'>,
  mapping: SourceMapping,
): boolean {
  const home = card.originalDeckName ?? card.deckName;
  if (home === mapping.deckName) {
    return true;
  }
  return mapping.deckScope === 'deck-and-subdecks' && home.startsWith(`${mapping.deckName}::`);
}
