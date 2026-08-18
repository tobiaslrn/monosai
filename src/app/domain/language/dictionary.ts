import type { PartOfSpeech } from '../reading/token';
import type { Result } from '../shared/result';
import type { LanguageError } from './language-error';

export interface DictionarySense {
  readonly partsOfSpeech: readonly PartOfSpeech[];
  readonly glossesEn: readonly string[];
}

export interface DictionaryEntry {
  readonly id: string;
  /** Kanji spellings, most common first. Empty for kana-only words. */
  readonly writtenForms: readonly string[];
  /** Kana spellings as the dataset records them, most common first. */
  readonly readings: readonly string[];
  readonly senses: readonly DictionarySense[];
}

export interface DictionaryQuery {
  readonly surface: string;
  readonly lemma?: string;
  readonly readingHiragana?: string;
  readonly partOfSpeech?: PartOfSpeech;
  /** Upper bound on returned entries. The index applies its own bound too. */
  readonly limit?: number;
}

/**
 * Which step of the documented lookup order produced the result.
 *
 * The UI needs this to explain a match honestly: a reading-based hit is not the
 * same claim as an exact surface hit, and `none` must render as
 * "No bundled definition" rather than an empty list of unclear provenance.
 */
export type DictionaryMatchBasis = 'surface' | 'lemma' | 'reading' | 'variant' | 'none';

export interface DictionaryLookup {
  readonly matchedBy: DictionaryMatchBasis;
  readonly entries: readonly DictionaryEntry[];
}

/**
 * Port for the bundled offline dictionary. Lookup never touches the network and
 * never falls back to an online source.
 *
 * A failure is reported as a typed error rather than an empty result, so the UI
 * can tell "no bundled definition" apart from "the dictionary is unavailable".
 */
export interface Dictionary {
  lookup(query: DictionaryQuery): Promise<Result<DictionaryLookup, LanguageError>>;
}

export const DICTIONARY_RESULT_LIMIT = 4;
