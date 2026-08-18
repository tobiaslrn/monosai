import { katakanaToHiragana, normalizeLookupKey } from '../../app/domain/language/kana';
import type { Token } from '../../app/domain/reading/token';
import { isPunctuationToken, mapPartOfSpeech } from './ipadic-mapping';
import type { RawToken } from './tokenizer-runtime';

/** Thrown when tokenizer output cannot be aligned with the source text. */
export class TokenAlignmentError extends Error {}

function utf8Length(codePoint: number): number {
  if (codePoint < 0x80) {
    return 1;
  }
  if (codePoint < 0x800) {
    return 2;
  }
  return codePoint < 0x10000 ? 3 : 4;
}

/**
 * Builds a byte-offset to UTF-16-offset table for one text.
 *
 * The tokenizer reports UTF-8 byte offsets while JavaScript strings are indexed
 * in UTF-16 code units, and the difference is exactly where surrogate pairs and
 * combining marks go wrong. Walking the text once by code point keeps the
 * conversion exact for astral characters.
 */
function byteToUtf16Table(text: string): Map<number, number> {
  const table = new Map<number, number>();
  let byteOffset = 0;
  let utf16Offset = 0;
  for (const character of text) {
    table.set(byteOffset, utf16Offset);
    byteOffset += utf8Length(character.codePointAt(0) ?? 0);
    utf16Offset += character.length;
  }
  table.set(byteOffset, utf16Offset);
  return table;
}

function dictionaryKeysFor(surface: string, lemma: string, reading: string): readonly string[] {
  const keys = new Set<string>();
  for (const candidate of [surface, lemma, reading]) {
    if (candidate.length > 0) {
      keys.add(normalizeLookupKey(candidate));
    }
  }
  return [...keys];
}

/**
 * Converts raw tokenizer output into domain tokens over the original text.
 *
 * Offsets are verified against the source: every token surface must equal the
 * slice it claims, and the tokens must tile the text without gaps, so a rendered
 * sentence can always be rebuilt from untouched source slices.
 */
export function mapRawTokens(text: string, rawTokens: readonly RawToken[]): readonly Token[] {
  const table = byteToUtf16Table(text);
  const tokens: Token[] = [];
  let cursor = 0;

  for (const raw of rawTokens) {
    const start = table.get(raw.byteStart);
    const end = table.get(raw.byteEnd);
    if (start === undefined || end === undefined || end <= start) {
      throw new TokenAlignmentError(
        `Token offsets ${raw.byteStart}-${raw.byteEnd} do not fall on character boundaries`,
      );
    }
    if (start !== cursor) {
      throw new TokenAlignmentError(
        `Token at ${String(start)} leaves the range ${String(cursor)}-${String(start)} uncovered`,
      );
    }
    const surface = text.slice(start, end);
    if (surface !== raw.surface) {
      throw new TokenAlignmentError('Token surface does not match the source slice');
    }
    const reading = katakanaToHiragana(raw.reading);
    const lemma = raw.baseForm.length > 0 ? raw.baseForm : undefined;
    const partOfSpeech = mapPartOfSpeech(raw);
    tokens.push({
      id: `t${String(tokens.length)}`,
      startUtf16: start,
      endUtf16: end,
      surface,
      ...(lemma === undefined ? {} : { lemma }),
      ...(reading.length === 0 ? {} : { readingHiragana: reading }),
      ...(partOfSpeech === undefined ? {} : { partOfSpeech }),
      dictionaryKeys: dictionaryKeysFor(surface, raw.baseForm, reading),
      isPunctuation: isPunctuationToken(raw),
    });
    cursor = end;
  }

  if (cursor !== text.length) {
    throw new TokenAlignmentError(
      `Analysis covers ${String(cursor)} of ${String(text.length)} code units`,
    );
  }
  return tokens;
}
