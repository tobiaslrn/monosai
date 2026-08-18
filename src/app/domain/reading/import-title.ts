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

/**
 * Strips the extension from a file name.
 *
 * A leading-dot name such as `.gitignore` has no extension to remove, and a
 * name with several dots keeps everything before the last one.
 */
export function titleFromFileName(fileName: string): string {
  const withoutPath = fileName.split(/[\\/]/).pop() ?? fileName;
  const lastDot = withoutPath.lastIndexOf('.');
  const stem = lastDot > 0 ? withoutPath.slice(0, lastDot) : withoutPath;
  const trimmed = stem.trim();
  return trimmed.length === 0
    ? FALLBACK_READING_TITLE
    : truncate(trimmed, MAXIMUM_DERIVED_TITLE_LENGTH);
}

/** Uses the first non-empty line of pasted text, truncated for display. */
export function titleFromPastedText(text: string): string {
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length > 0) {
      return truncate(trimmed, MAXIMUM_DERIVED_TITLE_LENGTH);
    }
  }
  return FALLBACK_READING_TITLE;
}

/**
 * Resolves what is actually stored. An emptied title field falls back to the
 * derived suggestion rather than saving a reading with no name.
 */
export function resolveTitle(entered: string, derived: string): string {
  const trimmed = entered.trim();
  if (trimmed.length === 0) {
    return derived.trim().length === 0 ? FALLBACK_READING_TITLE : derived;
  }
  return truncate(trimmed, MAXIMUM_TITLE_LENGTH);
}
