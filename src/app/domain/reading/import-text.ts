/**
 * Validation and normalization of text on its way into an imported reading.
 *
 * Everything here is pure: the same input always produces the same normalized
 * text and the same typed rejection, so the rules can be tested without a
 * browser, a worker, or a file.
 */

import { formatCount, formatCountOf } from '../shared/locale';

/**
 * Upper bound on imported text, counted in Unicode code points rather than
 * UTF-16 code units so a limit stated to the learner in "characters" is not
 * silently halved by emoji or other astral-plane characters.
 */
export const MAXIMUM_IMPORT_CHARACTERS = 50_000;

/** Long enough to make sentence-scoped aids unreliable, while allowing prose and lyrics. */
export const MAXIMUM_UNPUNCTUATED_CHARACTERS = 240;

export type ImportAdvisoryCode = 'little-japanese' | 'long-unpunctuated';

export interface ImportAdvisory {
  readonly code: ImportAdvisoryCode;
  readonly message: string;
}

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
  return text
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/[\p{Cf}\p{Cc}]/gu, (character) =>
      character === '\n' || character === '\t' ? character : '',
    );
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
  return /[\p{L}\p{N}]/u.test(text);
}

/** True for the scripts that provide a useful Japanese-reading signal. */
export function containsJapanese(text: string): boolean {
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text);
}

function longestUnpunctuatedRun(text: string): number {
  let longest = 0;
  for (const run of text.split(/[。！？．.!?\n]/u)) {
    longest = Math.max(longest, countCharacters(run));
  }
  return longest;
}

/** Non-blocking guidance shown before local analysis begins. */
export function importAdvisories(text: string): readonly ImportAdvisory[] {
  if (!hasVisibleText(text)) {
    return [];
  }

  const advisories: ImportAdvisory[] = [];
  if (!containsJapanese(text)) {
    advisories.push({
      code: 'little-japanese',
      message:
        'This text does not appear to contain Japanese. Check that you pasted the intended text before adding it.',
    });
  }
  if (longestUnpunctuatedRun(text) > MAXIMUM_UNPUNCTUATED_CHARACTERS) {
    advisories.push({
      code: 'long-unpunctuated',
      message:
        'A long passage has no sentence-ending punctuation. It will be divided into shorter reading sections.',
    });
  }
  return advisories;
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
        `That text is ${formatCountOf(characterCount, 'character')}. The limit is ${formatCount(MAXIMUM_IMPORT_CHARACTERS)}.`,
        characterCount,
      ),
    };
  }

  return { ok: true, value: { text, characterCount } };
}
