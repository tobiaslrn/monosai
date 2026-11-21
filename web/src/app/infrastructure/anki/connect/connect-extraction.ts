import { ankiError, type AnkiError } from '../../../domain/anki/anki-error';
import type { AnkiExtractionEvent } from '../../../domain/anki/anki-provider';
import type { SourceMapping } from '../../../domain/vocabulary/source-mapping';
import type { AnkiConnectClient, ReviewsOfCards } from './connect-client';
import { batched, filteredByNameFor, searchFor } from './connect-search';
import { captureActivity, type ActivityPools } from './connect-activity';
import { resolveDifficultyPercents } from './difficulty-search';
import {
  fsrsDifficultyFromPercent,
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
import { resolveIntroducedFirstReviews } from './introduced-first-review';
import { matchCardPredicates } from './card-predicate-search';
import { err, ok, type Result } from '../../../domain/shared/result';

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
  /** Whether first-review study days can be recovered through `introduced:N`. */
  readonly readsIntroducedHistory?: boolean;
  /**
   * Whether FSRS difficulty has to be recovered through `prop:d` searches.
   *
   * The desktop add-on's `cardsInfo` carries no memory state and no action
   * exposes it; the bridge reads difficulty straight from AnkiDroid's columns.
   */
  readonly searchesFsrsDifficulty?: boolean;
  /** One timestamp per mapping keeps every recovered day internally consistent. */
  readonly now?: () => number;
  /**
   * Whether `cardsInfo` names the home deck of a card sitting in a filtered deck.
   *
   * The first-party bridge does, as `originalDeckName`. The desktop add-on
   * reports only the deck a card currently sits in, which for a filtered card
   * says nothing about where it belongs: a filtered deck built inside the mapped
   * deck can hold cards from anywhere. Anki's own `deck:filtered` search is
   * asked which cards sit in a filtered deck, and a `did:` search by deck id
   * which of those belong to the mapping, or a name search on an Anki whose
   * `did:` cannot see home decks.
   */
  readonly reportsHomeDeck?: boolean;
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
 * Deck membership is confirmed against the home deck of each card rather than
 * trusted from the query alone, so a provider whose search semantics differ
 * cannot widen a mapping's scope unnoticed. Where the endpoint cannot name the
 * home deck of a card sitting in a filtered deck, Anki is asked for it by id,
 * or by name on an older Anki.
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
  const eligibleCards: CardInfo[] = [];
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
  const homes = new HomeDeckCheck(client, mapping, signal);

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

    const reviewed = cards.value.filter((card) => isEligibleReviewedCard(card.reps, card.queue));
    // A card reported in the mapped deck itself is at home there. Any other
    // deck may be a filtered one, unless the endpoint named the home deck.
    const unexplained = reviewed.filter(
      (card) =>
        options.reportsHomeDeck !== true &&
        (card.originalDeckName ?? null) === null &&
        card.deckName !== mapping.deckName,
    );
    const resolved = await homes.belonging(unexplained);
    if (!resolved.ok) {
      yield { kind: 'failed', error: resolved.error };
      return;
    }
    const eligible = reviewed.filter(
      (card) => resolved.value.get(card.cardId) ?? inScope(card, mapping),
    );
    eligibleCards.push(...eligible);
    // Counted by what was asked, so a card deleted during the read still
    // moves progress to the total the search reported.
    examined += batch.length;

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
            message: 'Anki could not provide review dates; recent words are estimated.',
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

  if (options.readsIntroducedHistory === true && eligibleCards.length > 0) {
    const firstReviews = await resolveIntroducedFirstReviews(
      client,
      eligibleCards.map((card) => card.cardId),
      options.now?.() ?? Date.now(),
      signal,
    );
    if (!firstReviews.ok && firstReviews.error.code === 'cancelled') {
      yield { kind: 'failed', error: firstReviews.error };
      return;
    }
    if (!firstReviews.ok) {
      if (!warnedAboutReviews) {
        yield {
          kind: 'warning',
          message: 'Anki could not provide first study dates; recent words are estimated.',
        };
      }
    } else {
      for (const card of eligibleCards) {
        const firstReview = firstReviews.value.get(card.cardId);
        if (firstReview === undefined) continue;
        schedulingByNote.set(
          card.note,
          mergeSchedulingSignals(schedulingByNote.get(card.note), firstReview),
        );
      }
    }
  }

  const withoutDifficulty = eligibleCards.filter(
    (card) => card.fsrsDifficulty === undefined || card.fsrsDifficulty === null,
  );
  if (options.searchesFsrsDifficulty === true && withoutDifficulty.length > 0) {
    const percents = await resolveDifficultyPercents(
      client,
      withoutDifficulty.map((card) => card.cardId),
      signal,
    );
    if (!percents.ok && percents.error.code === 'cancelled') {
      yield { kind: 'failed', error: percents.error };
      return;
    }
    // An Anki too old for `prop:d`, like a collection still on SM-2, simply has
    // no difficulty to report. That is what the basis already says, and the
    // learner has nothing to act on, so it is not worth a warning.
    if (percents.ok) {
      for (const card of withoutDifficulty) {
        const percent = percents.value.get(card.cardId);
        if (percent === undefined) continue;
        schedulingByNote.set(
          card.note,
          mergeSchedulingSignals(schedulingByNote.get(card.note), {
            fsrsDifficulty: fsrsDifficultyFromPercent(percent),
          }),
        );
        sawFsrsDifficulty = true;
      }
    }
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
      const meaningField =
        mapping.meaningFieldName === undefined ? undefined : fields[mapping.meaningFieldName];
      yield {
        kind: 'entry',
        entry: {
          sourceMappingId: mapping.id,
          sourceNoteId: String(note.noteId),
          ...(field === undefined ? {} : { rawFieldValue: field.value }),
          ...(meaningField === undefined ? {} : { rawMeaning: meaningField.value }),
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
 * How a filtered card's home deck is asked: by deck id where Anki's `did:` sees
 * home decks, by deck name where it does not.
 */
type HomeSearch = 'by-id' | 'by-name';

/**
 * Errors that mean Anki answered but cannot run the search as asked, such as a
 * `did:` list an older Anki cannot parse. The name search still works there;
 * anything else, such as a cancelled refresh or Anki quitting, ends the read.
 */
const UNABLE_TO_SEARCH: readonly AnkiError['code'][] = [
  'query-failed',
  'unsupported-action',
  'malformed-response',
];

/**
 * Decides which cards belong to a mapping when the endpoint names only the deck
 * each card sits in.
 *
 * Anki's `deck:filtered` says which cards sit in a filtered deck; for every
 * other card the reported deck is its home. What `did:` matches depends on the
 * Anki release: up to 2.1.66 it takes one deck id, 23.10 to 24.06 take a list,
 * and both match only the deck a card sits in; from 24.11 it also matches a
 * filtered card's home deck. The AnkiConnect version does not say which, so
 * Anki is asked once per mapping, about one filtered card, with the id of every
 * deck but the one it sits in: a match can only come through its home.
 *
 * Where it matches, each filtered card is asked with the ids of the mapping's
 * decks less the filtered decks these cards sit in, which is exact. Otherwise,
 * or when Anki cannot run the search, the cards are decided by deck name, which
 * is exact for a filtered deck outside the mapped tree; see
 * {@link filteredByNameFor}. Every search here is asked only when a card needs
 * it, so a mapping nobody studies from a filtered deck costs at most the one
 * `deck:filtered` search.
 */
class HomeDeckCheck {
  private moved: ReadonlySet<number> | undefined;
  private deckIds: Readonly<Record<string, number>> | undefined;
  private search: HomeSearch | undefined;
  private keptByName: ReadonlySet<number> | undefined;

  constructor(
    private readonly client: AnkiConnectClient,
    private readonly mapping: SourceMapping,
    private readonly signal: AbortSignal | undefined,
  ) {}

  /** Whether each card sitting in a filtered deck belongs; other cards are left out. */
  async belonging(
    cards: readonly CardInfo[],
  ): Promise<Result<ReadonlyMap<number, boolean>, AnkiError>> {
    const decisions = new Map<number, boolean>();
    if (cards.length === 0) {
      return ok(decisions);
    }
    if (this.moved === undefined) {
      const moved = await this.client.findCards(
        `(${searchFor(this.mapping)}) deck:filtered`,
        this.signal,
      );
      if (!moved.ok) {
        return moved;
      }
      this.moved = new Set(moved.value);
    }
    const moved = this.moved;
    const filtered = cards.filter((card) => moved.has(card.cardId));
    const [first] = filtered;
    if (first === undefined) {
      return ok(decisions);
    }
    if (this.search === undefined) {
      const search = await this.probe(first);
      if (!search.ok) {
        return search;
      }
      this.search = search.value;
    }
    let belonging = this.search === 'by-id' ? await this.byId(filtered) : await this.byName();
    if (
      !belonging.ok &&
      this.search === 'by-id' &&
      UNABLE_TO_SEARCH.includes(belonging.error.code)
    ) {
      this.search = 'by-name';
      belonging = await this.byName();
    }
    if (!belonging.ok) {
      return belonging;
    }
    for (const card of filtered) {
      decisions.set(card.cardId, belonging.value.has(card.cardId));
    }
    return ok(decisions);
  }

  /**
   * Whether this Anki's `did:` matches a filtered card by its home deck.
   *
   * `deck:filtered` is asked again, so a card sent home in the meantime, which
   * every listed id would then match, reads as no rather than as yes.
   */
  private async probe(card: CardInfo): Promise<Result<HomeSearch, AnkiError>> {
    const deckIds = await this.client.deckNamesAndIds(this.signal);
    if (!deckIds.ok) {
      return byNameUnless(deckIds.error);
    }
    this.deckIds = deckIds.value;
    const others = Object.entries(deckIds.value)
      .filter(([name]) => name !== card.deckName)
      .map(([, id]) => id);
    if (!Object.hasOwn(deckIds.value, card.deckName) || others.length === 0) {
      return ok('by-name');
    }
    const seen = await this.client.findCards(
      `cid:${card.cardId} deck:filtered did:${others.join(',')}`,
      this.signal,
    );
    if (!seen.ok) {
      return byNameUnless(seen.error);
    }
    return ok(seen.value.includes(card.cardId) ? 'by-id' : 'by-name');
  }

  private async byId(
    filtered: readonly CardInfo[],
  ): Promise<Result<ReadonlySet<number>, AnkiError>> {
    const deckIds = this.deckIds ?? {};
    const sittingIn = new Set(filtered.map((card) => card.deckName));
    const homeIds = Object.entries(deckIds)
      .filter(([name]) => !sittingIn.has(name) && inScope({ deckName: name }, this.mapping))
      .map(([, id]) => id);
    if (homeIds.length === 0) {
      return ok(new Set<number>());
    }
    return matchCardPredicates(
      this.client,
      filtered.map((card) => ({ cardId: card.cardId, term: `did:${homeIds.join(',')}` })),
      this.signal,
    );
  }

  private async byName(): Promise<Result<ReadonlySet<number>, AnkiError>> {
    if (this.keptByName === undefined) {
      const kept = await this.client.findCards(filteredByNameFor(this.mapping), this.signal);
      if (!kept.ok) {
        return kept;
      }
      this.keptByName = new Set(kept.value);
    }
    return ok(this.keptByName);
  }
}

function byNameUnless(error: AnkiError): Result<HomeSearch, AnkiError> {
  return UNABLE_TO_SEARCH.includes(error.code) ? ok('by-name') : err(error);
}

/**
 * Confirms the card belongs to the mapping's deck by the deck it reports.
 *
 * A filtered deck moves a card without changing where it belongs, so its home
 * deck decides where the endpoint names it. Checking only the current deck would
 * drop exactly the cards the learner is studying right now, which is the
 * opposite of what recent practice is for; the caller asks Anki about the cards
 * sitting in a filtered deck whose home deck the endpoint does not name.
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
