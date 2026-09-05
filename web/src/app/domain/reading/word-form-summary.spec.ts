import { describe, expect, it } from 'vitest';
import type { WordGroup } from './token-grouping';
import { summarizeWordForm, type WordFormSummary } from './word-form-summary';
import type { PartOfSpeech, Token } from './token';

type TokenDraft = Omit<Token, 'startUtf16' | 'endUtf16' | 'dictionaryKeys' | 'isPunctuation'>;

function wordFrom(drafts: readonly TokenDraft[], headIndex = 0): WordGroup {
  const tokens = drafts.map((draft, index) => ({
    ...draft,
    startUtf16: index,
    endUtf16: index + draft.surface.length,
    dictionaryKeys: [],
    isPunctuation: false,
  }));
  return {
    span: { startTokenIndex: 0, endTokenIndex: tokens.length - 1 },
    tokens,
    head: tokens[headIndex],
    surface: tokens.map((token) => token.surface).join(''),
    readingHiragana: undefined,
  };
}

function token(
  id: string,
  surface: string,
  partOfSpeech: PartOfSpeech,
  options: Pick<TokenDraft, 'lemma' | 'inflectionForm'> = {},
): TokenDraft {
  return { id, surface, partOfSpeech, ...options };
}

function summarize(drafts: readonly TokenDraft[]): WordFormSummary {
  return summarizeWordForm(wordFrom(drafts));
}

describe('summarizeWordForm', () => {
  it('identifies a plain negative past form', () => {
    expect(
      summarize([
        token('t0', '分から', 'verb', { lemma: '分かる', inflectionForm: 'irrealis' }),
        token('t1', 'なかっ', 'auxiliary', { lemma: 'ない', inflectionForm: 'continuative-ta' }),
        token('t2', 'た', 'auxiliary', { lemma: 'た', inflectionForm: 'dictionary' }),
      ]).formLabels,
    ).toEqual(['Plain', 'negative', 'past']);
  });

  it('identifies polite without inventing a derivation', () => {
    expect(
      summarize([
        token('t0', '飲み', 'verb', { lemma: '飲む', inflectionForm: 'continuative' }),
        token('t1', 'ます', 'auxiliary', { lemma: 'ます', inflectionForm: 'dictionary' }),
      ]).formLabels,
    ).toEqual(['Polite']);
  });

  it('identifies a negative form without calling a stem past', () => {
    expect(
      summarize([
        token('t0', '行か', 'verb', { lemma: '行く', inflectionForm: 'irrealis' }),
        token('t1', 'ない', 'auxiliary', { lemma: 'ない', inflectionForm: 'dictionary' }),
      ]).formLabels,
    ).toEqual(['Plain', 'negative']);

    expect(
      summarize([token('t0', '読ん', 'verb', { lemma: '読む', inflectionForm: 'continuative-ta' })])
        .formLabels,
    ).toEqual([]);
  });

  it('identifies past only when the past auxiliary is present', () => {
    expect(
      summarize([
        token('t0', '行っ', 'verb', { lemma: '行く', inflectionForm: 'continuative-ta' }),
        token('t1', 'た', 'auxiliary', { lemma: 'た', inflectionForm: 'dictionary' }),
      ]).formLabels,
    ).toEqual(['Plain', 'past']);
  });

  it('identifies te-form and ongoing evidence in order', () => {
    expect(
      summarize([
        token('t0', '読ん', 'verb', { lemma: '読む', inflectionForm: 'continuative-ta' }),
        token('t1', 'で', 'particle', { lemma: 'で' }),
      ]).formLabels,
    ).toEqual(['Plain', 'te-form']);

    expect(
      summarize([
        token('t0', '読ん', 'verb', { lemma: '読む', inflectionForm: 'continuative-ta' }),
        token('t1', 'で', 'particle', { lemma: 'で' }),
        token('t2', 'いる', 'auxiliary', { lemma: 'いる', inflectionForm: 'dictionary' }),
      ]).formLabels,
    ).toEqual(['Plain', 'te-form', 'ongoing']);
  });

  it('identifies conditional, imperative, and volitional forms from inflection evidence', () => {
    expect(
      summarize([token('t0', '行け', 'verb', { lemma: '行く', inflectionForm: 'hypothetical' })])
        .formLabels,
    ).toEqual(['Plain', 'conditional']);
    expect(
      summarize([token('t0', '行け', 'verb', { lemma: '行く', inflectionForm: 'imperative' })])
        .formLabels,
    ).toEqual(['Plain', 'imperative']);
    expect(
      summarize([
        token('t0', '行こ', 'verb', { lemma: '行く', inflectionForm: 'irrealis-volitional' }),
        token('t1', 'う', 'auxiliary', { lemma: 'う', inflectionForm: 'dictionary' }),
      ]).formLabels,
    ).toEqual(['Plain', 'volitional']);
  });

  it('retains passive/potential ambiguity instead of choosing one', () => {
    expect(
      summarize([
        token('t0', '食べ', 'verb', { lemma: '食べる', inflectionForm: 'irrealis' }),
        token('t1', 'られる', 'suffix', { lemma: 'られる', inflectionForm: 'dictionary' }),
      ]).formLabels,
    ).toEqual(['Plain', 'passive / potential']);
  });

  it('omits unsupported and uninflected classifications', () => {
    expect(
      summarize([
        token('t0', '食べ', 'verb', { lemma: '食べる', inflectionForm: 'continuative' }),
        token('t1', '過ぎ', 'auxiliary', { lemma: '過ぎる', inflectionForm: 'continuative' }),
      ]).formLabels,
    ).toEqual([]);
    expect(summarize([token('t0', '猫', 'noun', { lemma: '猫' })])).toEqual({
      dictionaryForm: '猫',
      partOfSpeech: 'noun',
      formLabels: [],
    });
  });

  it('preserves the analyzer dictionary form and part of speech', () => {
    expect(
      summarize([
        token('t0', '小さかっ', 'adjective-i', {
          lemma: '小さい',
          inflectionForm: 'continuative-ta',
        }),
        token('t1', 'た', 'auxiliary', { lemma: 'た', inflectionForm: 'dictionary' }),
      ]),
    ).toMatchObject({ dictionaryForm: '小さい', partOfSpeech: 'i-adjective' });
  });
});
