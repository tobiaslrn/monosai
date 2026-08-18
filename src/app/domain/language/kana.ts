const KATAKANA_START = 0x30a1;
const KATAKANA_END = 0x30f6;
const KANA_OFFSET = 0x60;
const HIRAGANA_START = 0x3041;
const HIRAGANA_END = 0x3096;
const HALFWIDTH_KATAKANA_START = 0xff66;
const HALFWIDTH_KATAKANA_END = 0xff9d;
const PROLONGED_SOUND_MARK = 'ー';

const KANJI_RANGES: readonly (readonly [number, number])[] = [
  [0x3400, 0x4dbf],
  [0x4e00, 0x9fff],
  [0xf900, 0xfaff],
];

/**
 * Converts katakana to hiragana so readings, dictionary keys, and vocabulary
 * forms compare in one script. Characters outside the katakana block, including
 * the prolonged sound mark, are left exactly as they are.
 */
export function katakanaToHiragana(text: string): string {
  let converted = '';
  for (const character of text) {
    const code = character.codePointAt(0);
    if (code !== undefined && code >= KATAKANA_START && code <= KATAKANA_END) {
      converted += String.fromCodePoint(code - KANA_OFFSET);
    } else {
      converted += character;
    }
  }
  return converted;
}

export function isHiragana(character: string): boolean {
  const code = character.codePointAt(0);
  return code !== undefined && code >= HIRAGANA_START && code <= HIRAGANA_END;
}

export function isKatakana(character: string): boolean {
  const code = character.codePointAt(0);
  if (code === undefined) {
    return false;
  }
  return (
    (code >= KATAKANA_START && code <= KATAKANA_END) ||
    (code >= HALFWIDTH_KATAKANA_START && code <= HALFWIDTH_KATAKANA_END)
  );
}

export function isKanji(character: string): boolean {
  const code = character.codePointAt(0);
  return code !== undefined && KANJI_RANGES.some(([start, end]) => code >= start && code <= end);
}

export function containsKanji(text: string): boolean {
  // Iterating by code point is the point here: a kanji outside the basic plane
  // must be seen as one character, not as two surrogate halves.
  // eslint-disable-next-line @typescript-eslint/no-misused-spread
  return [...text].some((character) => isKanji(character));
}

/** True when every character is kana, a prolonged sound mark, or a kana mark. */
export function isKanaOnly(text: string): boolean {
  // eslint-disable-next-line @typescript-eslint/no-misused-spread -- code-point iteration is intended
  const characters = [...text];
  if (characters.length === 0) {
    return false;
  }
  return characters.every(
    (character) =>
      isHiragana(character) || isKatakana(character) || character === PROLONGED_SOUND_MARK,
  );
}

/**
 * Decides whether a reading adds information above the surface it annotates.
 *
 * Kana-only tokens never receive redundant ruby, and neither does a reading that
 * is identical to the surface once both are normalized to hiragana.
 */
export function readingAddsInformation(surface: string, readingHiragana: string): boolean {
  if (readingHiragana.length === 0 || !containsKanji(surface)) {
    return false;
  }
  return katakanaToHiragana(surface) !== readingHiragana;
}

/**
 * Single normalization used for every lookup key: Unicode NFKC, then katakana
 * folded to hiragana. NFKC also folds half-width katakana and full-width Latin,
 * which keeps `ｱｲｳ` and `ＡＢＣ` comparable with their ordinary spellings.
 */
export function normalizeLookupKey(text: string): string {
  return katakanaToHiragana(text.normalize('NFKC'));
}
