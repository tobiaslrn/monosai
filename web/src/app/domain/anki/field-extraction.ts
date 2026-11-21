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
 * warning. Ruby readings are not visible text and never reach this point; an
 * expression also drops Anki's own reading and cloze syntax, see
 * `extractExpression`.
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

/**
 * Anki's reading syntax, exactly as its `kanji:` filter matches it: a run of
 * text, then its reading in brackets. A space before the run only marks where
 * the reading starts, so it goes with the reading.
 */
const BRACKET_READING = / ?([^ >]+?)\[(.+?)\]/gu;

/** A cloze with no other cloze inside it: `{{c1::answer}}` or `{{c1::answer::hint}}`. */
const INNERMOST_CLOZE = /\{\{c\d+::((?:(?!\{\{c\d+::)[\s\S])*?)\}\}/gu;

/** Keeps each cloze's answer, innermost first, so a nested cloze unwraps too. */
function unwrapClozes(text: string): string {
  let current = text;
  for (;;) {
    const next = current.replace(INNERMOST_CLOZE, (_match, body: string) => {
      const hint = body.indexOf('::');
      return hint === -1 ? body : body.slice(0, hint);
    });
    if (next === current) {
      return current;
    }
    current = next;
  }
}

/** Removes bracket readings; a `[sound:…]` tag is media, which Anki leaves alone too. */
function dropBracketReadings(text: string): string {
  return text.replace(BRACKET_READING, (match, base: string, reading: string) =>
    reading.startsWith('sound:') ? match : base,
  );
}

/**
 * Reads one selected field as a vocabulary expression.
 *
 * The same literal reading as `extractVisibleText`, plus the two pieces of
 * Anki syntax that are never part of the word a learner sees on a card: a
 * cloze shows its answer, and bracket readings are shown above the text they
 * follow. `{{c1::食[た]べる::verb}}` is therefore `食べる`, the word the reader
 * shows, rather than an entry that can never match one.
 */
export function extractExpression(
  raw: string | undefined,
  extractor: MarkupTextExtractor,
): Result<string, FieldRejection> {
  const visible = extractVisibleText(raw, extractor);
  if (!visible.ok) {
    return visible;
  }
  const value = dropBracketReadings(unwrapClozes(visible.value)).trim();
  return value.length === 0 ? err('empty') : ok(value);
}
