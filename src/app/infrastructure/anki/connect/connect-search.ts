import type { SourceMapping } from '../../../domain/vocabulary/source-mapping';

/**
 * Escapes a value for use inside a quoted Anki search term.
 *
 * Anki treats `"` and `\` specially inside quotes; everything else, including
 * spaces and `::`, is literal. Deck and note type names come from discovery, so
 * they are not attacker-controlled, but a deck called `Grammar "notes"` is
 * perfectly legal and would otherwise end the term early.
 */
function escapeTerm(value: string): string {
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

/** Splits ids into request-sized batches. */
export function batched<T>(items: readonly T[], size: number): readonly (readonly T[])[] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}
