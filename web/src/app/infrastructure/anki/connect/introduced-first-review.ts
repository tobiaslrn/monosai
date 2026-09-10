import type { AnkiError } from '../../../domain/anki/anki-error';
import { ok, type Result } from '../../../domain/shared/result';
import {
  buildCardPredicateQueries,
  matchCardPredicates,
  type CardPredicateQuery,
  type CardSearchClient,
} from './card-predicate-search';

const DAY_MS = 86_400_000;

interface SearchState {
  readonly cardId: number;
  low: number;
  high: number;
}

interface IntroducedPredicate {
  readonly cardId: number;
  readonly days: number;
}

export interface IntroducedFirstReview {
  readonly firstReviewedAt: number;
  readonly firstReviewedPrecision: 'anki-day';
}

/**
 * Recovers each card's first answered Anki day through the supported search language.
 *
 * AnkiDroid does not publish its revlog, but its card provider delegates searches to
 * Anki's backend. `introduced:N` is implemented there as the earliest revlog id with
 * a non-zero ease, so it excludes manual reschedules and has the same semantics as
 * the exact desktop/package read. Parallel binary search keeps the number of search
 * rounds logarithmic, while every generated query stays below the bridge limit.
 */
export async function resolveIntroducedFirstReviews(
  client: CardSearchClient,
  cardIds: readonly number[],
  now: number,
  signal?: AbortSignal,
): Promise<Result<ReadonlyMap<number, IntroducedFirstReview>, AnkiError>> {
  const states = [...new Set(cardIds)]
    .filter((cardId) => Number.isSafeInteger(cardId) && cardId > 0)
    .map((cardId): SearchState => ({
      cardId,
      low: 1,
      // Card ids are their creation time in milliseconds. Two spare days cover
      // the unknown collection rollover and clock skew without assuming midnight.
      high: Math.max(1, Math.ceil(Math.max(0, now - cardId) / DAY_MS) + 2),
    }));

  while (states.some((state) => state.low < state.high)) {
    const predicates = states
      .filter((state) => state.low < state.high)
      .map((state) => ({
        cardId: state.cardId,
        days: Math.floor((state.low + state.high) / 2),
      }));
    const searched = await matchCardPredicates(client, predicates.map(toCardPredicate), signal);
    if (!searched.ok) {
      return searched;
    }
    for (const state of states) {
      if (state.low >= state.high) continue;
      const midpoint = Math.floor((state.low + state.high) / 2);
      if (searched.value.has(state.cardId)) {
        state.high = midpoint;
      } else {
        state.low = midpoint + 1;
      }
    }
  }

  // The binary search assumes each upper bound matches. Confirm the final
  // predicate so a reviewed count with missing history stays unknown instead
  // of receiving a fabricated date.
  const confirmed = await matchCardPredicates(
    client,
    states.map((state) => toCardPredicate({ cardId: state.cardId, days: state.low })),
    signal,
  );
  if (!confirmed.ok) {
    return confirmed;
  }

  const reviews = new Map<number, IntroducedFirstReview>();
  for (const state of states) {
    if (!confirmed.value.has(state.cardId)) continue;
    reviews.set(state.cardId, {
      firstReviewedAt: representativeLocalDate(state.low, now),
      firstReviewedPrecision: 'anki-day',
    });
  }
  return ok(reviews);
}

/** Local day-start is stable for display and never lies in the future today. */
export function representativeLocalDate(introducedDays: number, now: number): number {
  const date = new Date(now);
  date.setDate(date.getDate() - Math.max(0, introducedDays - 1));
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** Packs same-threshold ids together, then packs clauses under the provider limit. */
export function buildIntroducedQueries(
  predicates: readonly IntroducedPredicate[],
): readonly CardPredicateQuery[] {
  return buildCardPredicateQueries(predicates.map(toCardPredicate));
}

function toCardPredicate({ cardId, days }: IntroducedPredicate) {
  return { cardId, term: `introduced:${String(days)}` };
}
