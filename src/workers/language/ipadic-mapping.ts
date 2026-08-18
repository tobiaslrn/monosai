import type { PartOfSpeech } from '../../app/domain/reading/token';
import type { RawToken } from './tokenizer-runtime';

/**
 * Maps IPADIC part-of-speech tags onto Monosai's bounded enum.
 *
 * Raw IPADIC tags never leave this file: the rest of the application only ever
 * sees the bounded enum, which is what keeps the tokenizer replaceable.
 *
 * Two mappings are deliberate rather than literal. A non-independent verb
 * (`\u52d5\u8a5e,\u975e\u81ea\u7acb`) such as the `\u3044\u308b` of `\u3066\u3044\u308b` functions as an auxiliary, and a
 * numeric counter suffix (`\u540d\u8a5e,\u63a5\u5c3e,\u52a9\u6570\u8a5e`) is a counter rather than a plain
 * suffix. Both distinctions are what the structural baseline matches on.
 */
const UNKNOWN_TAG = 'UNK';

const NUMERIC = /^[0-9\uff10-\uff19]+$/;
const SYMBOLIC = /^[\p{S}]+$/u;
const PUNCTUATION_OR_SPACE = /^[\p{P}\s]+$/u;

const SIMPLE_TAGS: Readonly<Record<string, PartOfSpeech>> = {
  助詞: 'particle',
  助動詞: 'auxiliary',
  副詞: 'adverb',
  連体詞: 'determiner',
  接続詞: 'conjunction',
  接頭詞: 'prefix',
  感動詞: 'interjection',
  フィラー: 'interjection',
  記号: 'symbol',
  その他: 'other',
};

function mapNoun(token: RawToken): PartOfSpeech {
  if (token.subcategory1 === '固有名詞') {
    return 'proper-noun';
  }
  if (token.subcategory1 === '代名詞') {
    return 'pronoun';
  }
  if (token.subcategory1 === '数') {
    return 'number';
  }
  if (token.subcategory1 === '形容動詞語幹') {
    return 'adjective-na';
  }
  if (token.subcategory1 === '接尾') {
    return token.subcategory2 === '助数詞' ? 'counter' : 'suffix';
  }
  return 'noun';
}

export function mapPartOfSpeech(token: RawToken): PartOfSpeech | undefined {
  if (token.partOfSpeech === UNKNOWN_TAG || token.partOfSpeech.length === 0) {
    if (NUMERIC.test(token.surface)) {
      return 'number';
    }
    if (SYMBOLIC.test(token.surface)) {
      return 'symbol';
    }
    if (PUNCTUATION_OR_SPACE.test(token.surface)) {
      return 'symbol';
    }
    return undefined;
  }
  if (token.partOfSpeech === '名詞') {
    return mapNoun(token);
  }
  if (token.partOfSpeech === '動詞') {
    if (token.subcategory1 === '非自立') {
      return 'auxiliary';
    }
    return token.subcategory1 === '接尾' ? 'suffix' : 'verb';
  }
  if (token.partOfSpeech === '形容詞') {
    return token.subcategory1 === '接尾' ? 'suffix' : 'adjective-i';
  }
  return SIMPLE_TAGS[token.partOfSpeech] ?? 'other';
}

/**
 * Punctuation and whitespace are formatting, not vocabulary. IPADIC symbol
 * subcategories are trusted first, and any remaining token whose surface is
 * entirely punctuation or whitespace is treated the same way.
 */
export function isPunctuationToken(token: RawToken): boolean {
  if (
    token.partOfSpeech === '記号' &&
    ['句点', '読点', '括弧開', '括弧閉', '空白', '一般'].includes(token.subcategory1)
  ) {
    return true;
  }
  return PUNCTUATION_OR_SPACE.test(token.surface);
}
