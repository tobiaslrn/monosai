import { describe, expect, it } from 'vitest';
import { wordAt } from './token-grouping';
import type { Token } from './token';
import { wordRubySegments } from './word-ruby';

function token(
  id: string,
  surface: string,
  readingHiragana?: string,
  partOfSpeech: Token['partOfSpeech'] = 'verb',
): Token {
  return {
    id,
    startUtf16: 0,
    endUtf16: surface.length,
    surface,
    ...(readingHiragana === undefined ? {} : { readingHiragana }),
    partOfSpeech,
    dictionaryKeys: [surface],
    isPunctuation: false,
  };
}

describe('wordRubySegments', () => {
  it('puts the stem reading above the kanji and leaves the kana ending in place', () => {
    const word = wordAt(
      [
        token('stem', '開い', 'ひらい'),
        token('te', 'て', 'て', 'particle'),
        token('iru', 'い', 'い', 'auxiliary'),
        token('masu', 'まし', 'まし', 'auxiliary'),
        token('ta', 'た', 'た', 'auxiliary'),
      ],
      0,
    );

    expect(word.surface).toBe('開いていました');
    expect(wordRubySegments(word)).toEqual([
      { text: '開', reading: 'ひら' },
      { text: 'い', reading: null },
      { text: 'て', reading: null },
      { text: 'い', reading: null },
      { text: 'まし', reading: null },
      { text: 'た', reading: null },
    ]);
  });

  it('keeps kana-only and unreadable tokens plain', () => {
    expect(wordRubySegments(wordAt([token('kana', 'います', 'います')], 0))).toEqual([
      { text: 'います', reading: null },
    ]);
    expect(wordRubySegments(wordAt([token('unknown', '開く')], 0))).toEqual([
      { text: '開く', reading: null },
    ]);
  });

  it('uses whole-token ruby when a compound cannot be split conservatively', () => {
    expect(wordRubySegments(wordAt([token('compound', '申し訳', 'もうしわけ')], 0))).toEqual([
      { text: '申し訳', reading: 'もうしわけ' },
    ]);
  });
});
