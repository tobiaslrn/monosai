import type { AnkiError } from '../../../domain/anki/anki-error';
import { ok, type Result } from '../../../domain/shared/result';
import { matchCardPredicates, type CardSearchClient } from './card-predicate-search';

interface SearchState {
  readonly cardId: number;
  /** Highest percent proved to match. */
  low: number;
  /** Highest percent not yet ruled out. */
  high: number;
}

/**
 * Recovers each card's FSRS difficulty, to the whole percent, through Anki's search.
 *
 * AnkiConnect's `cardsInfo` carries no memory state and no action exposes it,
 * but Anki's own `prop:d` search compares it. A parallel binary search finds the
 * highest percent each card still matches: seven rounds split 0-100, and cards
 * sharing a threshold share one clause, so a round usually costs one request.
 * A final query confirms the bound, so a card without FSRS memory state, which
 * matches no difficulty at all, stays unknown rather than reading as 0%.
 */
export async function resolveDifficultyPercents(
  client: CardSearchClient,
  cardIds: readonly number[],
  signal?: AbortSignal,
): Promise<Result<ReadonlyMap<number, number>, AnkiError>> {
  const states = [...new Set(cardIds)]
    .filter((cardId) => Number.isSafeInteger(cardId) && cardId > 0)
    .map((cardId): SearchState => ({ cardId, low: 0, high: 100 }));

  while (states.some((state) => state.low < state.high)) {
    const open = states.filter((state) => state.low < state.high);
    const searched = await matchCardPredicates(
      client,
      open.map((state) => ({ cardId: state.cardId, term: difficultyTerm(upperMidpoint(state)) })),
      signal,
    );
    if (!searched.ok) {
      return searched;
    }
    for (const state of open) {
      const midpoint = upperMidpoint(state);
      if (searched.value.has(state.cardId)) {
        state.low = midpoint;
      } else {
        state.high = midpoint - 1;
      }
    }
  }

  const confirmed = await matchCardPredicates(
    client,
    states.map((state) => ({ cardId: state.cardId, term: difficultyTerm(state.low) })),
    signal,
  );
  if (!confirmed.ok) {
    return confirmed;
  }

  const percents = new Map<number, number>();
  for (const state of states) {
    if (confirmed.value.has(state.cardId)) percents.set(state.cardId, state.low);
  }
  return ok(percents);
}

/**
 * Matches the cards whose difficulty rounds to `percent` or higher.
 *
 * Anki searches difficulty on 0-1, the same `(D - 1) / 9` the vocabulary browser
 * shows as a percent. Half a percent below the threshold is where rounding
 * carries a card up to it, so the recovered percent is the one the browser
 * would have shown for the exact value.
 */
export function difficultyTerm(percent: number): string {
  const threshold = percent <= 0 ? 0 : (percent - 0.5) / 100;
  return `prop:d>=${threshold.toFixed(3)}`;
}

function upperMidpoint(state: SearchState): number {
  return Math.ceil((state.low + state.high) / 2);
}
