import type { AnkiError } from '../../../domain/anki/anki-error';
import { ok, type Result } from '../../../domain/shared/result';
import type { AnkiConnectClient } from './connect-client';

const DAY_MS = 86_400_000;
const MAX_QUERY_LENGTH = 8_000;

interface SearchClient {
  findCards(query: string, signal?: AbortSignal): Promise<Result<readonly number[], AnkiError>>;
}

interface SearchState {
  readonly cardId: number;
  low: number;
  high: number;
}

interface IntroducedPredicate {
  readonly cardId: number;
  readonly days: number;
}

interface IntroducedQuery {
  readonly query: string;
  readonly predicates: readonly IntroducedPredicate[];
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
  client: Pick<AnkiConnectClient, 'findCards'> | SearchClient,
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
    const searched = await runPredicates(client, predicates, signal);
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
  const confirmed = await runPredicates(
    client,
    states.map((state) => ({ cardId: state.cardId, days: state.low })),
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

async function runPredicates(
  client: SearchClient,
  predicates: readonly IntroducedPredicate[],
  signal?: AbortSignal,
): Promise<Result<ReadonlySet<number>, AnkiError>> {
  const matched = new Set<number>();
  for (const request of buildQueries(predicates)) {
    const found = await client.findCards(request.query, signal);
    if (!found.ok) {
      return found;
    }
    const expected = new Set(request.predicates.map((predicate) => predicate.cardId));
    for (const cardId of found.value) {
      if (expected.has(cardId)) matched.add(cardId);
    }
  }
  return ok(matched);
}

/** Packs same-threshold ids together, then packs clauses under the provider limit. */
export function buildIntroducedQueries(
  predicates: readonly IntroducedPredicate[],
): readonly IntroducedQuery[] {
  return buildQueries(predicates);
}

function buildQueries(predicates: readonly IntroducedPredicate[]): readonly IntroducedQuery[] {
  if (predicates.length === 0) return [];
  const byDays = new Map<number, number[]>();
  for (const predicate of predicates) {
    const ids = byDays.get(predicate.days) ?? [];
    ids.push(predicate.cardId);
    byDays.set(predicate.days, ids);
  }

  const clauses: { text: string; predicates: IntroducedPredicate[] }[] = [];
  for (const [days, ids] of [...byDays.entries()].sort(([left], [right]) => left - right)) {
    let chunk: number[] = [];
    for (const cardId of ids) {
      const candidate = [...chunk, cardId];
      if (chunk.length > 0 && clause(candidate, days).length > MAX_QUERY_LENGTH) {
        clauses.push(toClause(chunk, days));
        chunk = [cardId];
      } else {
        chunk = candidate;
      }
    }
    if (chunk.length > 0) clauses.push(toClause(chunk, days));
  }

  const requests: IntroducedQuery[] = [];
  let texts: string[] = [];
  let packed: IntroducedPredicate[] = [];
  for (const current of clauses) {
    const candidate = [...texts, current.text].join(' OR ');
    if (texts.length > 0 && candidate.length > MAX_QUERY_LENGTH) {
      requests.push({ query: texts.join(' OR '), predicates: packed });
      texts = [current.text];
      packed = [...current.predicates];
    } else {
      texts.push(current.text);
      packed.push(...current.predicates);
    }
  }
  if (texts.length > 0) {
    requests.push({ query: texts.join(' OR '), predicates: packed });
  }
  return requests;
}

function toClause(ids: readonly number[], days: number) {
  return {
    text: clause(ids, days),
    predicates: ids.map((cardId) => ({ cardId, days })),
  };
}

function clause(ids: readonly number[], days: number): string {
  return `(cid:${ids.join(',')} introduced:${String(days)})`;
}
