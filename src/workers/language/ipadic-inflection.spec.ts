import { describe, expect, it } from 'vitest';
import type { InflectionForm } from '../../app/domain/reading/token';
import { mapInflectionForm } from './ipadic-inflection';
import type { RawToken } from './tokenizer-runtime';

function raw(inflectionForm: string): RawToken {
  return {
    surface: '行き',
    byteStart: 0,
    byteEnd: 6,
    partOfSpeech: '動詞',
    subcategory1: '自立',
    subcategory2: '*',
    subcategory3: '*',
    baseForm: '行く',
    reading: 'イキ',
    inflectionForm,
    conjugationClass: '五段・カ行促音便',
  };
}

/**
 * The table itself is unit-tested here. That it covers every tag the shipped
 * dictionary can actually emit is a question about the dictionary rather than
 * about this file, so the golden corpus asks it.
 */
describe('mapInflectionForm', () => {
  const cases: readonly (readonly [string, InflectionForm])[] = [
    ['基本形', 'dictionary'],
    ['音便基本形', 'dictionary'],
    ['基本形-促音便', 'dictionary'],
    ['文語基本形', 'dictionary'],
    ['未然形', 'irrealis'],
    ['未然ヌ接続', 'irrealis'],
    ['未然レル接続', 'irrealis'],
    ['未然特殊', 'irrealis'],
    ['未然ウ接続', 'irrealis-volitional'],
    ['連用形', 'continuative'],
    ['連用ニ接続', 'continuative'],
    ['連用ゴザイ接続', 'continuative'],
    ['連用タ接続', 'continuative-ta'],
    ['連用テ接続', 'continuative-te'],
    ['連用デ接続', 'continuative-te'],
    ['仮定形', 'hypothetical'],
    ['仮定縮約１', 'hypothetical'],
    ['仮定縮約２', 'hypothetical'],
    ['命令ｅ', 'imperative'],
    ['命令ｉ', 'imperative'],
    ['命令ｒｏ', 'imperative'],
    ['命令ｙｏ', 'imperative'],
    ['体言接続', 'attributive'],
    ['体言接続特殊', 'attributive'],
    ['体言接続特殊２', 'attributive'],
    ['ガル接続', 'stem'],
    ['その他', 'other'],
  ];

  for (const [tag, expected] of cases) {
    it(`maps ${tag} to ${expected}`, () => {
      expect(mapInflectionForm(raw(tag))).toBe(expected);
    });
  }

  it('reports an absent form rather than guessing one', () => {
    // A noun or particle carries no 活用形, which IPADIC writes as an asterisk
    // and the wrapper hands on as an empty string.
    expect(mapInflectionForm(raw(''))).toBeUndefined();
  });

  it('reports an unrecognized tag as absent', () => {
    expect(mapInflectionForm(raw('未知の活用形'))).toBeUndefined();
  });
});
