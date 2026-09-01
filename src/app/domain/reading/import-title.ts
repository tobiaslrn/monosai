/**
 * Title derivation for imported readings.
 *
 * The learner may always override the result; these rules only decide what the
 * title field is prefilled with.
 */

export const FALLBACK_READING_TITLE = 'Untitled reading';

/** Longest derived title. Longer text is truncated with an ellipsis. */
export const MAXIMUM_DERIVED_TITLE_LENGTH = 60;

/** Hard bound on a stored title, including one the learner typed. */
export const MAXIMUM_TITLE_LENGTH = 120;

function truncate(text: string, limit: number): string {
  // eslint-disable-next-line @typescript-eslint/no-misused-spread -- code-point iteration is intended
  const characters = [...text];
  return characters.length <= limit ? text : `${characters.slice(0, limit - 1).join('')}…`;
}

function meaningful(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text);
}

function firstSentence(text: string): string {
  const match = /[。！？．.!?]/u.exec(text);
  return match === null ? text : text.slice(0, match.index + match[0].length);
}

function normalizeTitle(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[\p{Cf}\p{Cc}]/gu, '')
    .trim();
}

/** Uses the first meaningful sentence of pasted text, truncated for display. */
export function titleFromPastedText(text: string): string {
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (meaningful(trimmed)) {
      return truncate(firstSentence(trimmed).trim(), MAXIMUM_DERIVED_TITLE_LENGTH);
    }
  }
  return FALLBACK_READING_TITLE;
}

/**
 * Resolves what is actually stored. An emptied title field falls back to the
 * derived suggestion rather than saving a reading with no name.
 */
export function resolveTitle(entered: string, derived: string): string {
  const trimmed = normalizeTitle(entered);
  if (!meaningful(trimmed)) {
    const normalizedDerived = normalizeTitle(derived);
    return meaningful(normalizedDerived) ? normalizedDerived : FALLBACK_READING_TITLE;
  }
  return truncate(trimmed, MAXIMUM_TITLE_LENGTH);
}
