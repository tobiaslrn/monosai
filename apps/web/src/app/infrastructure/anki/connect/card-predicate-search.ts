import type { AnkiError } from '../../../domain/anki/anki-error';
import { ok, type Result } from '../../../domain/shared/result';

/** Longest query sent, a safety margin below the bridge's input limit. */
export const MAX_QUERY_LENGTH = 8_000;

export interface CardSearchClient {
  findCards(query: string, signal?: AbortSignal): Promise<Result<readonly number[], AnkiError>>;
}

/** Whether one card matches one Anki search term. */
export interface CardPredicate {
  readonly cardId: number;
  readonly term: string;
}

export interface CardPredicateQuery {
  readonly query: string;
  readonly predicates: readonly CardPredicate[];
}

/**
 * Answers many per-card search questions with as few `findCards` requests as fit.
 *
 * Every returned id is intersected with the cards its request asked about, so an
 * endpoint whose search is wider than expected can never make an unasked card
 * match.
 */
export async function matchCardPredicates(
  client: CardSearchClient,
  predicates: readonly CardPredicate[],
  signal?: AbortSignal,
): Promise<Result<ReadonlySet<number>, AnkiError>> {
  const matched = new Set<number>();
  for (const request of buildCardPredicateQueries(predicates)) {
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

/** Packs cards sharing a term into one `cid:` clause, then clauses under the limit. */
export function buildCardPredicateQueries(
  predicates: readonly CardPredicate[],
): readonly CardPredicateQuery[] {
  const byTerm = new Map<string, number[]>();
  for (const predicate of predicates) {
    const ids = byTerm.get(predicate.term) ?? [];
    ids.push(predicate.cardId);
    byTerm.set(predicate.term, ids);
  }

  const clauses: { text: string; predicates: CardPredicate[] }[] = [];
  for (const [term, ids] of byTerm) {
    let chunk: number[] = [];
    for (const cardId of ids) {
      const candidate = [...chunk, cardId];
      if (chunk.length > 0 && clause(candidate, term).length > MAX_QUERY_LENGTH) {
        clauses.push(toClause(chunk, term));
        chunk = [cardId];
      } else {
        chunk = candidate;
      }
    }
    if (chunk.length > 0) clauses.push(toClause(chunk, term));
  }

  const requests: CardPredicateQuery[] = [];
  let texts: string[] = [];
  let packed: CardPredicate[] = [];
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

function toClause(ids: readonly number[], term: string) {
  return {
    text: clause(ids, term),
    predicates: ids.map((cardId) => ({ cardId, term })),
  };
}

function clause(ids: readonly number[], term: string): string {
  return `(cid:${ids.join(',')} ${term})`;
}
