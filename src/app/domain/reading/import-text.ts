/**
 * Validation and normalization of text on its way into an imported reading.
 *
 * Everything here is pure: the same input always produces the same normalized
 * text and the same typed rejection, so the rules can be tested without a
 * browser, a worker, or a file.
 */

/**
 * Upper bound on imported text, counted in Unicode code points rather than
 * UTF-16 code units so a limit stated to the learner in "characters" is not
 * silently halved by emoji or other astral-plane characters.
 */
export const MAXIMUM_IMPORT_CHARACTERS = 50_000;

export type ImportRejectionCode =
  /** Nothing but whitespace, so there is no reading to build. */
  | 'empty'
  /** Longer than `MAXIMUM_IMPORT_CHARACTERS`. */
  | 'too-long';

export interface ImportRejection {
  readonly code: ImportRejectionCode;
  readonly message: string;
  /** Present for `too-long`, so the UI can state how far over the limit it is. */
  readonly characterCount?: number;
}

function rejection(
  code: ImportRejectionCode,
  message: string,
  characterCount?: number,
): ImportRejection {
  return { code, message, ...(characterCount === undefined ? {} : { characterCount }) };
}

/**
 * Normalizes line endings and strips a leading byte-order mark.
 *
 * This is the only transformation applied to learner text. Everything after it
 * slices, never rewrites, so stored Japanese always matches what was imported.
 */
export function normalizeImportedText(text: string): string {
  const withoutBom = text.startsWith('﻿') ? text.slice(1) : text;
  return withoutBom.replace(/\r\n?/g, '\n');
}

/** Counts Unicode code points, which is what the stated limit means. */
export function countCharacters(text: string): number {
  let count = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    // Skip the low half of a surrogate pair so a pair counts as one character.
    if (code >= 0xdc00 && code <= 0xdfff) {
      continue;
    }
    count += 1;
  }
  return count;
}

/** True when the text contains something other than whitespace. */
export function hasVisibleText(text: string): boolean {
  return text.trim().length > 0;
}

export interface ValidatedImportText {
  readonly text: string;
  readonly characterCount: number;
}

/** Accepted pasted text, or the one reason it was refused. */
export type ImportTextOutcome =
  | { readonly ok: true; readonly value: ValidatedImportText }
  | { readonly ok: false; readonly error: ImportRejection };

/**
 * Validates pasted text.
 */
export function validateImportText(text: string): ImportTextOutcome {
  if (!hasVisibleText(text)) {
    return {
      ok: false,
      error: rejection('empty', 'Enter some Japanese text before continuing.'),
    };
  }

  const characterCount = countCharacters(text);
  if (characterCount > MAXIMUM_IMPORT_CHARACTERS) {
    return {
      ok: false,
      error: rejection(
        'too-long',
        `That text is ${characterCount.toLocaleString('en')} characters. The limit is ${MAXIMUM_IMPORT_CHARACTERS.toLocaleString('en')}.`,
        characterCount,
      ),
    };
  }

  return { ok: true, value: { text, characterCount } };
}
