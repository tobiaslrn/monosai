/** How much of the opening the library card stores to show as a preview. */
export const EXCERPT_LENGTH = 160;

/**
 * The opening of a reading, kept on the reading row for the library card.
 *
 * A card shows Japanese rather than a table of counts, and a shelf of cards
 * must still be one bounded query: storing the excerpt is what keeps rendering
 * the library from loading every reading's sentences. It is a preview, not the
 * text — the reader always renders from the sentences themselves.
 */
export function buildExcerpt(sourceText: string): string {
  const collapsed = sourceText.replace(/\s+/gu, ' ').trim();
  return collapsed.length <= EXCERPT_LENGTH ? collapsed : collapsed.slice(0, EXCERPT_LENGTH);
}
