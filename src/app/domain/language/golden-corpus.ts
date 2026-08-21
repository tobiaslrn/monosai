import { ANALYZER_VERSION, VALIDATOR_VERSION } from './analyzer-version';

/**
 * Reviewed language fixtures.
 *
 * Every expectation here was checked by hand against the shipped tokenizer and
 * datasets. They are versioned by analyzer and validator version: a tokenizer or
 * rule change requires reviewing and editing these entries deliberately, never
 * regenerating them from whatever the new version happens to produce.
 */
export const GOLDEN_CORPUS_VERSIONS = {
  analyzerVersion: ANALYZER_VERSION,
  validatorVersion: VALIDATOR_VERSION,
} as const;

export interface GoldenTokenExpectation {
  readonly surface: string;
  readonly lemma?: string;
  readonly readingHiragana?: string;
  readonly partOfSpeech?: string;
  readonly inflectionForm?: string;
  readonly isPunctuation?: boolean;
}

export interface GoldenAnalysisCase {
  readonly name: string;
  readonly text: string;
  /** Full expected token surfaces, in order. */
  readonly surfaces: readonly string[];
  /** Spot expectations for individual tokens, keyed by their index. */
  readonly tokens?: Readonly<Record<number, GoldenTokenExpectation>>;
}

export const GOLDEN_ANALYSIS_CASES: readonly GoldenAnalysisCase[] = [
  {
    name: 'kana-only sentence',
    text: 'ねこがすきです',
    surfaces: ['ねこ', 'が', 'すき', 'です'],
    tokens: {
      0: { surface: 'ねこ', readingHiragana: 'ねこ', partOfSpeech: 'noun' },
      1: { surface: 'が', partOfSpeech: 'particle' },
      3: { surface: 'です', lemma: 'です', partOfSpeech: 'auxiliary' },
    },
  },
  {
    name: 'kanji with okurigana',
    text: '食べ物を買います',
    surfaces: ['食べ物', 'を', '買い', 'ます'],
    tokens: {
      0: { surface: '食べ物', readingHiragana: 'たべもの', partOfSpeech: 'noun' },
      2: { surface: '買い', lemma: '買う', readingHiragana: 'かい', partOfSpeech: 'verb' },
      3: { surface: 'ます', lemma: 'ます', partOfSpeech: 'auxiliary' },
    },
  },
  {
    name: 'polite past negative inflection',
    text: '行きませんでした',
    surfaces: ['行き', 'ませ', 'ん', 'でし', 'た'],
    tokens: {
      0: {
        surface: '行き',
        lemma: '行く',
        readingHiragana: 'いき',
        partOfSpeech: 'verb',
        inflectionForm: 'continuative',
      },
      1: { surface: 'ませ', lemma: 'ます', partOfSpeech: 'auxiliary', inflectionForm: 'irrealis' },
      2: { surface: 'ん', lemma: 'ん', partOfSpeech: 'auxiliary', inflectionForm: 'dictionary' },
    },
  },
  {
    name: 'plain negative past of an irregular verb',
    text: '来なかった',
    surfaces: ['来', 'なかっ', 'た'],
    tokens: {
      0: { surface: '来', lemma: '来る', partOfSpeech: 'verb', inflectionForm: 'irrealis' },
      1: {
        surface: 'なかっ',
        lemma: 'ない',
        partOfSpeech: 'auxiliary',
        inflectionForm: 'continuative-ta',
      },
      2: { surface: 'た', lemma: 'た', partOfSpeech: 'auxiliary', inflectionForm: 'dictionary' },
    },
  },
  {
    name: 'irregular suru verb',
    text: '勉強しました',
    surfaces: ['勉強', 'し', 'まし', 'た'],
    tokens: {
      0: { surface: '勉強', readingHiragana: 'べんきょう', partOfSpeech: 'noun' },
      1: { surface: 'し', lemma: 'する', partOfSpeech: 'verb' },
    },
  },
  {
    name: 'i-adjective inflection',
    text: '高くなかった',
    surfaces: ['高く', 'なかっ', 'た'],
    tokens: {
      0: { surface: '高く', lemma: '高い', readingHiragana: 'たかく', partOfSpeech: 'adjective-i' },
    },
  },
  {
    name: 'potential form of an ichidan verb',
    text: '食べられる',
    surfaces: ['食べ', 'られる'],
    tokens: {
      0: { surface: '食べ', lemma: '食べる', partOfSpeech: 'verb' },
      1: { surface: 'られる', lemma: 'られる', partOfSpeech: 'suffix' },
    },
  },
  {
    name: 'orthographic variant written in kanji',
    text: '珈琲を飲む',
    surfaces: ['珈琲', 'を', '飲む'],
    tokens: {
      0: { surface: '珈琲', readingHiragana: 'こーひー', partOfSpeech: 'noun' },
    },
  },
  {
    name: 'particles and auxiliaries',
    text: '私は本を読んでいます',
    surfaces: ['私', 'は', '本', 'を', '読ん', 'で', 'い', 'ます'],
    tokens: {
      1: { surface: 'は', partOfSpeech: 'particle' },
      5: { surface: 'で', lemma: 'で', partOfSpeech: 'particle' },
      6: { surface: 'い', lemma: 'いる', partOfSpeech: 'auxiliary' },
    },
  },
  {
    name: 'katakana loanword',
    text: 'テーブルの上',
    surfaces: ['テーブル', 'の', '上'],
    tokens: {
      0: { surface: 'テーブル', readingHiragana: 'てーぶる', partOfSpeech: 'noun' },
    },
  },
  {
    name: 'Japanese personal name with a suffix',
    text: '田中さんは東京へ行った',
    surfaces: ['田中', 'さん', 'は', '東京', 'へ', '行っ', 'た'],
    tokens: {
      0: { surface: '田中', partOfSpeech: 'proper-noun' },
      1: { surface: 'さん', partOfSpeech: 'suffix' },
      3: { surface: '東京', partOfSpeech: 'proper-noun' },
    },
  },
  {
    name: 'kanji numerals with a counter',
    text: '五冊',
    surfaces: ['五', '冊'],
    tokens: {
      0: { surface: '五', partOfSpeech: 'number' },
      1: { surface: '冊', partOfSpeech: 'counter' },
    },
  },
  {
    name: 'Arabic numerals in a date',
    text: '3月14日',
    surfaces: ['3', '月', '14', '日'],
    tokens: {
      0: { surface: '3', partOfSpeech: 'number' },
      3: { surface: '日', partOfSpeech: 'counter' },
    },
  },
  {
    name: 'time expression',
    text: '午後7時',
    surfaces: ['午後', '7', '時'],
    tokens: {
      2: { surface: '時', partOfSpeech: 'counter' },
    },
  },
  {
    name: 'quoted dialogue with nested brackets',
    text: '彼は「これは『本』だ。」と答えた。',
    surfaces: [
      '彼',
      'は',
      '「',
      'これ',
      'は',
      '『',
      '本',
      '』',
      'だ',
      '。',
      '」',
      'と',
      '答え',
      'た',
      '。',
    ],
    tokens: {
      2: { surface: '「', partOfSpeech: 'symbol', isPunctuation: true },
      9: { surface: '。', partOfSpeech: 'symbol', isPunctuation: true },
    },
  },
  {
    name: 'ellipsis and repeated punctuation',
    text: '……えっ！？',
    surfaces: ['…', '…', 'えっ', '！', '？'],
    tokens: {
      0: { surface: '…', isPunctuation: true },
      2: { surface: 'えっ', partOfSpeech: 'interjection' },
    },
  },
  {
    name: 'mixed Japanese and Latin text',
    text: 'ABCと言った',
    surfaces: ['ABC', 'と', '言っ', 'た'],
    tokens: {
      1: { surface: 'と', partOfSpeech: 'particle' },
    },
  },
  {
    name: 'emoji is a symbol, not punctuation',
    text: '猫😀',
    surfaces: ['猫', '😀'],
    tokens: {
      1: { surface: '😀', partOfSpeech: 'symbol', isPunctuation: false },
    },
  },
  {
    name: 'text that looks like markup stays inert text',
    text: '<b>猫</b>',
    surfaces: ['<', 'b', '>', '猫', '</', 'b', '>'],
  },
  {
    name: 'long compound token',
    text: '国際交流基金',
    surfaces: ['国際', '交流', '基金'],
  },
];

/** Sentences whose analysis must reproduce the source exactly, character for character. */
export const GOLDEN_ROUNDTRIP_TEXTS: readonly string[] = [
  'ねこがすきです',
  '田中さんは東京へ行きたくなかった。',
  '彼は「これは『本』だ。」と答えた。',
  '……えっ！？',
  '𠮷田さんは😀と書いた。',
  'が゙ぎ゚か゚',
  'ABC 123 二〇二五年3月14日 午後7時 五冊',
  'ｱｲｳ ＡＢＣ',
  '空白　全角スペースも保持する',
];
