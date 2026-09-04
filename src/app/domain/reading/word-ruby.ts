import {
  containsKanji,
  isHiragana,
  isKanaOnly,
  isKatakana,
  katakanaToHiragana,
} from '../language/kana';
import type { Token } from './token';
import type { WordGroup } from './token-grouping';

/** One visible piece of a word heading, optionally carrying furigana. */
export interface WordRubySegment {
  readonly text: string;
  readonly reading: string | null;
}

/**
 * Builds the presentation-only ruby for the word the learner opened.
 *
 * Token readings are the only source of truth. A token with one unambiguous
 * kanji run gets that run annotated and its matching kana ending stays in the
 * base text. Compounds or mismatches remain whole-token ruby: a guessed split
 * is more confusing to a beginner than a slightly broad annotation.
 */
export function wordRubySegments(word: WordGroup): readonly WordRubySegment[] {
  return word.tokens.flatMap((token) => rubySegmentsForToken(token));
}

function rubySegmentsForToken(token: Token): readonly WordRubySegment[] {
  const reading = token.readingHiragana;
  if (
    reading === undefined ||
    reading.length === 0 ||
    token.isPunctuation ||
    !containsKanji(token.surface) ||
    isKanaOnly(token.surface)
  ) {
    return [plain(token.surface)];
  }

  const normalizedReading = katakanaToHiragana(reading);
  if (katakanaToHiragana(token.surface) === normalizedReading) {
    return [plain(token.surface)];
  }

  const surfaceCharacters = Array.from(token.surface);
  const readingCharacters = Array.from(normalizedReading);
  const prefixLength = matchingPrefixLength(surfaceCharacters, readingCharacters);
  const suffixLength = matchingSuffixLength(
    surfaceCharacters.slice(prefixLength),
    readingCharacters.slice(prefixLength),
  );
  const baseEnd = surfaceCharacters.length - suffixLength;
  const baseSurface = surfaceCharacters.slice(prefixLength, baseEnd);
  const baseReading = readingCharacters.slice(
    prefixLength,
    readingCharacters.length - suffixLength,
  );

  if (
    baseSurface.length === 0 ||
    baseReading.length === 0 ||
    !hasOneKanjiRun(baseSurface) ||
    prefixLength + suffixLength >= surfaceCharacters.length
  ) {
    return [ruby(token.surface, normalizedReading)];
  }

  const segments: WordRubySegment[] = [];
  if (prefixLength > 0) {
    segments.push(plain(surfaceCharacters.slice(0, prefixLength).join('')));
  }
  segments.push(ruby(baseSurface.join(''), baseReading.join('')));
  if (suffixLength > 0) {
    segments.push(plain(surfaceCharacters.slice(baseEnd).join('')));
  }
  return segments;
}

function matchingPrefixLength(surface: readonly string[], reading: readonly string[]): number {
  let length = 0;
  while (length < surface.length && isKana(surface[length])) {
    if (reading[length] !== katakanaToHiragana(surface[length])) {
      return 0;
    }
    length += 1;
  }
  return length;
}

function matchingSuffixLength(surface: readonly string[], reading: readonly string[]): number {
  let length = 0;
  while (length < surface.length && isKana(surface[surface.length - 1 - length])) {
    const readingIndex = reading.length - 1 - length;
    if (
      readingIndex < 0 ||
      reading[readingIndex] !== katakanaToHiragana(surface[surface.length - 1 - length])
    ) {
      return 0;
    }
    length += 1;
  }
  return length;
}

function hasOneKanjiRun(surface: readonly string[]): boolean {
  let runs = 0;
  let inRun = false;
  for (const character of surface) {
    if (containsKanji(character)) {
      if (!inRun) {
        runs += 1;
        inRun = true;
      }
    } else {
      inRun = false;
    }
  }
  return runs === 1;
}

function isKana(character: string): boolean {
  return isHiragana(character) || isKatakana(character) || character === 'ー';
}

function plain(text: string): WordRubySegment {
  return { text, reading: null };
}

function ruby(text: string, reading: string): WordRubySegment {
  return { text, reading };
}
