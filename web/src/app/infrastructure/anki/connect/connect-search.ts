import type { SourceMapping } from '../../../domain/vocabulary/source-mapping';

/**
 * Escapes a value for use inside a quoted Anki search term.
 *
 * Anki treats `"` and `\` specially inside quotes; everything else, including
 * spaces and `::`, is literal. Deck and note type names come from discovery, so
 * they are not attacker-controlled, but a deck called `Grammar "notes"` is
 * perfectly legal and would otherwise end the term early.
 */
export function escapeTerm(value: string): string {
  return value.replace(/[\\"]/gu, (match) => `\\${match}`);
}

/**
 * Builds the search for one mapping.
 *
 * Anki's `deck:` already includes subdecks, so the narrower `deck-only` scope is
 * the one that needs expressing — by subtracting the descendants — rather than
 * the wider one. Getting this backwards would silently pull a learner's whole
 * deck tree into a mapping that named one deck.
 */
export function searchFor(mapping: SourceMapping): string {
  const deck = escapeTerm(mapping.deckName);
  const noteType = escapeTerm(mapping.noteTypeName);
  const terms = [`"deck:${deck}"`, `"note:${noteType}"`];
  if (mapping.deckScope === 'deck-only') {
    terms.push(`-"deck:${deck}::*"`);
  }
  return terms.join(' ');
}

/**
 * The activity searches run for one mapping, in a fixed order.
 *
 * Anki answers these itself, against its own study days and the learner's own
 * rollover, which is the only thing that knows when a day ended. `rated:`
 * membership also survives a deck the learner reset and started again: the card
 * is in today's pool because it was answered today, whatever its history says.
 *
 * The pools nest — `rated:1` is a subset of `rated:3` is a subset of `rated:7` —
 * and that invariant is checked after the reads, because they are separate
 * queries over a live collection rather than one atomic snapshot.
 */
export const ACTIVITY_SEARCHES = [
  { key: 'answered1', term: 'rated:1' },
  { key: 'answered3', term: 'rated:3' },
  { key: 'answered7', term: 'rated:7' },
  { key: 'again7', term: 'rated:7:1' },
  { key: 'hard7', term: 'rated:7:2' },
] as const;

export type ActivitySearchKey = (typeof ACTIVITY_SEARCHES)[number]['key'];

/**
 * Narrows one activity search to a mapping's own cards.
 *
 * The mapping scope is repeated rather than the search run collection-wide, so
 * a card outside the mapping can never reach its vocabulary through the
 * intersection, and the provider does the filtering it is best at.
 */
export function activitySearchFor(mapping: SourceMapping, term: string): string {
  return `(${searchFor(mapping)}) ${term}`;
}

/** Splits ids into request-sized batches. */
export function batched<T>(items: readonly T[], size: number): readonly (readonly T[])[] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}
