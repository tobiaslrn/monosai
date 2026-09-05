import type { InflectionForm } from '../../app/domain/reading/token';
import type { RawToken } from './tokenizer-runtime';

/**
 * Maps IPADIC 活用形 tags onto Monosai's bounded inflection-form enum.
 *
 * Raw IPADIC tags never leave this file, the same contract `ipadic-mapping.ts`
 * keeps for part of speech.
 *
 * IPADIC distinguishes stems by what may follow them rather than by what they
 * mean, and several of those distinctions carry nothing a reader needs. The
 * four 未然 tags all produce the same stem an ending attaches to, so they
 * collapse — except 未然ウ接続, which exists only before the volitional う and is
 * therefore the one piece of evidence that 行こ is a volitional. The same
 * reasoning keeps 連用タ接続 and 連用テ接続 apart from plain 連用形: those two
 * are where the sound changes of 読ん and 買っ live.
 */
const INFLECTION_TAGS: Readonly<Record<string, InflectionForm>> = {
  基本形: 'dictionary',
  音便基本形: 'dictionary',
  '基本形-促音便': 'dictionary',
  文語基本形: 'dictionary',

  未然形: 'irrealis',
  未然ヌ接続: 'irrealis',
  未然レル接続: 'irrealis',
  未然特殊: 'irrealis',

  未然ウ接続: 'irrealis-volitional',

  連用形: 'continuative',
  連用ニ接続: 'continuative',
  連用ゴザイ接続: 'continuative',

  連用タ接続: 'continuative-ta',

  連用テ接続: 'continuative-te',
  連用デ接続: 'continuative-te',

  仮定形: 'hypothetical',
  仮定縮約１: 'hypothetical',
  仮定縮約２: 'hypothetical',

  命令ｅ: 'imperative',
  命令ｉ: 'imperative',
  命令ｒｏ: 'imperative',
  命令ｙｏ: 'imperative',

  体言接続: 'attributive',
  体言接続特殊: 'attributive',
  体言接続特殊２: 'attributive',

  ガル接続: 'stem',
  その他: 'other',
};

/**
 * The inflected shape of one token, or `undefined` where there is none.
 *
 * A noun or particle carries no 活用形 at all, and an unknown tag is reported as
 * absent rather than guessed: a wrong form name would be read as fact by a
 * learner who cannot yet check it.
 */
export function mapInflectionForm(token: RawToken): InflectionForm | undefined {
  return INFLECTION_TAGS[token.inflectionForm];
}
