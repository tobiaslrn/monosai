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
  | 'too-long'
  /** The chosen file is not decodable as UTF-8. */
  | 'not-utf8'
  /** The file decoded, but holds no visible text. */
  | 'no-visible-text';

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

/** Accepted text, or the one reason it was refused. */
export type ImportTextOutcome =
  | { readonly ok: true; readonly value: ValidatedImportText }
  | { readonly ok: false; readonly error: ImportRejection };

export type DecodeOutcome =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly error: ImportRejection };

/**
 * Validates already-normalized text.
 *
 * `emptyCode` distinguishes an empty paste box from a file that decoded but
 * turned out to hold no visible text; the specification requires those to read
 * as different problems.
 */
export function validateImportText(
  text: string,
  emptyCode: Extract<ImportRejectionCode, 'empty' | 'no-visible-text'> = 'empty',
): ImportTextOutcome {
  if (!hasVisibleText(text)) {
    return {
      ok: false,
      error:
        emptyCode === 'empty'
          ? rejection('empty', 'Enter some Japanese text before continuing.')
          : rejection('no-visible-text', 'That file contains no visible text.'),
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

/**
 * Decodes file bytes as strict UTF-8.
 *
 * Strict decoding is the point: a Shift_JIS file would otherwise decode into
 * replacement characters and be saved as permanently corrupted Japanese, so a
 * decoding failure must reach the learner as its own error.
 */
export function decodeUtf8(bytes: BufferSource): DecodeOutcome {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { ok: true, value: normalizeImportedText(text) };
  } catch {
    return {
      ok: false,
      error: rejection(
        'not-utf8',
        'That file is not UTF-8 text. Re-save it as UTF-8 and try again.',
      ),
    };
  }
}
