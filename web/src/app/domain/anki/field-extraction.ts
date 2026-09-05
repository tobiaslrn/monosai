import { err, ok, type Result } from '../shared/result';
import type { MarkupTextExtractor } from './markup-text';

/**
 * Why a field value produced no vocabulary entry.
 *
 * These are the only three reasons allowed. An odd-looking value — a sentence,
 * a phrase, several expressions separated by slashes — is accepted as written,
 * because the learner chose the field deliberately and Monosai does not decide
 * which part of it is the "real" word.
 */
export type FieldRejection = 'missing' | 'empty' | 'unsafe';

/**
 * Normalizes line endings without touching anything else.
 *
 * Stored Japanese must survive byte for byte apart from this, so no other
 * whitespace inside the value is collapsed, trimmed, or reordered.
 */
function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/gu, '\n');
}

/**
 * Reads one selected field literally.
 *
 * The rules are deliberately narrow: parse markup inertly, keep the visible
 * text, normalize newlines, trim the outside, and reject only what cannot
 * become an expression at all. Nothing here splits on separators, converts
 * between kana and kanji, or consults the dictionary — an entry that never
 * matches generated output is accepted product behaviour, not an import
 * warning.
 */
export function extractVisibleText(
  raw: string | undefined,
  extractor: MarkupTextExtractor,
): Result<string, FieldRejection> {
  if (raw === undefined) {
    return err('missing');
  }

  const visible = extractor.toVisibleText(raw);
  if (visible === null) {
    return err('unsafe');
  }

  const value = normalizeNewlines(visible).trim();
  if (value.length === 0) {
    return err('empty');
  }
  return ok(value);
}
