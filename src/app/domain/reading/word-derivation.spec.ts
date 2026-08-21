import { describe, expect, it } from 'vitest';
import { sharedStructuralBaseline } from '../../../testing/language-runtime';
import { wordAt } from './token-grouping';
import type { Token } from './token';
import { deriveWord, type WordDerivation } from './word-derivation';

/**
 * Analyses captured from the tokenizer that ships, keyed by the text they came
 * from, so this stays a focused domain test rather than a second analyzer run.
 *
 * That the shipped tokenizer still produces these tokens is the golden corpus's
 * question, and it asks it against the real thing. What is checked here is what
 * the domain makes of them.
 *
 * Offsets are omitted: nothing in a derivation reads them.
 */
type Analysis = Omit<Token, 'startUtf16' | 'endUtf16' | 'dictionaryKeys' | 'isPunctuation'>;

const ANALYSES: Readonly<Record<string, readonly Analysis[]>> = {
  分からなかった: [
    {
      id: 't0',
      surface: '分から',
      lemma: '分かる',
      partOfSpeech: 'verb',
      inflectionForm: 'irrealis',
    },
    {
      id: 't1',
      surface: 'なかっ',
      lemma: 'ない',
      partOfSpeech: 'auxiliary',
      inflectionForm: 'continuative-ta',
    },
    {
      id: 't2',
      surface: 'た',
      lemma: 'た',
      partOfSpeech: 'auxiliary',
      inflectionForm: 'dictionary',
    },
  ],
  食べさせられたくなかった: [
    {
      id: 't0',
      surface: '食べ',
      lemma: '食べる',
      partOfSpeech: 'verb',
      inflectionForm: 'irrealis',
    },
    {
      id: 't1',
      surface: 'させ',
      lemma: 'させる',
      partOfSpeech: 'suffix',
      inflectionForm: 'irrealis',
    },
    {
      id: 't2',
      surface: 'られ',
      lemma: 'られる',
      partOfSpeech: 'suffix',
      inflectionForm: 'continuative',
    },
    {
      id: 't3',
      surface: 'たく',
      lemma: 'たい',
      partOfSpeech: 'auxiliary',
      inflectionForm: 'continuative-te',
    },
    {
      id: 't4',
      surface: 'なかっ',
      lemma: 'ない',
      partOfSpeech: 'auxiliary',
      inflectionForm: 'continuative-ta',
    },
    {
      id: 't5',
      surface: 'た',
      lemma: 'た',
      partOfSpeech: 'auxiliary',
      inflectionForm: 'dictionary',
    },
  ],
  行きませんでした: [
    {
      id: 't0',
      surface: '行き',
      lemma: '行く',
      partOfSpeech: 'verb',
      inflectionForm: 'continuative',
    },
    {
      id: 't1',
      surface: 'ませ',
      lemma: 'ます',
      partOfSpeech: 'auxiliary',
      inflectionForm: 'irrealis',
    },
    {
      id: 't2',
      surface: 'ん',
      lemma: 'ん',
      partOfSpeech: 'auxiliary',
      inflectionForm: 'dictionary',
    },
    {
      id: 't3',
      surface: 'でし',
      lemma: 'です',
      partOfSpeech: 'auxiliary',
      inflectionForm: 'continuative',
    },
    {
      id: 't4',
      surface: 'た',
      lemma: 'た',
      partOfSpeech: 'auxiliary',
      inflectionForm: 'dictionary',
    },
  ],
  行きません: [
    {
      id: 't0',
      surface: '行き',
      lemma: '行く',
      partOfSpeech: 'verb',
      inflectionForm: 'continuative',
    },
    {
      id: 't1',
      surface: 'ませ',
      lemma: 'ます',
      partOfSpeech: 'auxiliary',
      inflectionForm: 'irrealis',
    },
    {
      id: 't2',
      surface: 'ん',
      lemma: 'ん',
      partOfSpeech: 'auxiliary',
      inflectionForm: 'dictionary',
    },
  ],
  読んでいる: [
    {
      id: 't0',
      surface: '読ん',
      lemma: '読む',
      partOfSpeech: 'verb',
      inflectionForm: 'continuative-ta',
    },
    { id: 't1', surface: 'で', lemma: 'で', partOfSpeech: 'particle' },
    {
      id: 't2',
      surface: 'いる',
      lemma: 'いる',
      partOfSpeech: 'auxiliary',
      inflectionForm: 'dictionary',
    },
  ],
  見せてしまった: [
    {
      id: 't0',
      surface: '見せ',
      lemma: '見せる',
      partOfSpeech: 'verb',
      inflectionForm: 'continuative',
    },
    { id: 't1', surface: 'て', lemma: 'て', partOfSpeech: 'particle' },
    {
      id: 't2',
      surface: 'しまっ',
      lemma: 'しまう',
      partOfSpeech: 'auxiliary',
      inflectionForm: 'continuative-ta',
    },
    {
      id: 't3',
      surface: 'た',
      lemma: 'た',
      partOfSpeech: 'auxiliary',
      inflectionForm: 'dictionary',
    },
  ],
  行けば: [
    {
      id: 't0',
      surface: '行け',
      lemma: '行く',
      partOfSpeech: 'verb',
      inflectionForm: 'hypothetical',
    },
    { id: 't1', surface: 'ば', lemma: 'ば', partOfSpeech: 'particle' },
  ],
  行け: [
    {
      id: 't0',
      surface: '行け',
      lemma: '行く',
      partOfSpeech: 'verb',
      inflectionForm: 'imperative',
    },
  ],
  行こう: [
    {
      id: 't0',
      surface: '行こ',
      lemma: '行く',
      partOfSpeech: 'verb',
      inflectionForm: 'irrealis-volitional',
    },
    {
      id: 't1',
      surface: 'う',
      lemma: 'う',
      partOfSpeech: 'auxiliary',
      inflectionForm: 'dictionary',
    },
  ],
  学生でした: [
    { id: 't0', surface: '学生', lemma: '学生', partOfSpeech: 'noun' },
    {
      id: 't1',
      surface: 'でし',
      lemma: 'です',
      partOfSpeech: 'auxiliary',
      inflectionForm: 'continuative',
    },
    {
      id: 't2',
      surface: 'た',
      lemma: 'た',
      partOfSpeech: 'auxiliary',
      inflectionForm: 'dictionary',
    },
  ],
  高くない: [
    {
      id: 't0',
      surface: '高く',
      lemma: '高い',
      partOfSpeech: 'adjective-i',
      inflectionForm: 'continuative-te',
    },
    {
      id: 't1',
      surface: 'ない',
      lemma: 'ない',
      partOfSpeech: 'auxiliary',
      inflectionForm: 'dictionary',
    },
  ],
  大きかった: [
    {
      id: 't0',
      surface: '大きかっ',
      lemma: '大きい',
      partOfSpeech: 'adjective-i',
      inflectionForm: 'continuative-ta',
    },
    {
      id: 't1',
      surface: 'た',
      lemma: 'た',
      partOfSpeech: 'auxiliary',
      inflectionForm: 'dictionary',
    },
  ],
  猫: [{ id: 't0', surface: '猫', lemma: '猫', partOfSpeech: 'noun' }],
  猫である: [
    { id: 't0', surface: '猫', lemma: '猫', partOfSpeech: 'noun' },
    {
      id: 't1',
      surface: 'で',
      lemma: 'だ',
      partOfSpeech: 'auxiliary',
      inflectionForm: 'continuative',
    },
    {
      id: 't2',
      surface: 'ある',
      lemma: 'ある',
      partOfSpeech: 'auxiliary',
      inflectionForm: 'dictionary',
    },
  ],
  分かる: [
    {
      id: 't0',
      surface: '分かる',
      lemma: '分かる',
      partOfSpeech: 'verb',
      inflectionForm: 'dictionary',
    },
  ],
  書ける: [
    {
      id: 't0',
      surface: '書ける',
      lemma: '書ける',
      partOfSpeech: 'verb',
      inflectionForm: 'dictionary',
    },
  ],
  食べ過ぎ: [
    {
      id: 't0',
      surface: '食べ',
      lemma: '食べる',
      partOfSpeech: 'verb',
      inflectionForm: 'continuative',
    },
    {
      id: 't1',
      surface: '過ぎ',
      lemma: '過ぎる',
      partOfSpeech: 'auxiliary',
      inflectionForm: 'continuative',
    },
  ],
};

const baseline = sharedStructuralBaseline();

function tokensFor(text: string): readonly Token[] {
  return ANALYSES[text].map((token) => ({
    ...token,
    startUtf16: 0,
    endUtf16: token.surface.length,
    dictionaryKeys: [],
    isPunctuation: false,
  }));
}

function derive(text: string): WordDerivation | null {
  return deriveWord(wordAt(tokensFor(text), 0), baseline);
}

/** The ladder as a reader sees it: what is attached, what it does, what results. */
function ladder(derivation: WordDerivation | null): readonly string[] {
  return (derivation?.steps ?? []).map(
    (step) => `${step.attached} · ${step.effectEn} → ${step.resultingSurface}`,
  );
}

describe('deriveWord', () => {
  it('names each ending in its own dictionary form, not as the stem on the page', () => {
    const derivation = derive('分からなかった');

    expect(derivation?.baseSurface).toBe('分かる');
    expect(derivation?.baseLabel).toBe('dictionary form');
    expect(ladder(derivation)).toEqual([
      'ない · negation → 分からない',
      'た · past and completion → 分からなかった',
    ]);
  });

  it('records the stem as written, so the ladder can point at it in the word', () => {
    const derivation = derive('分からなかった');

    expect(derivation?.steps.map((step) => step.surface)).toEqual(['なかっ', 'た']);
    expect(derivation?.steps[0].detailEn).toBe(
      'Negates a verb or auxiliary, inflecting to なく and なかっ.',
    );
  });

  it('says what the whole form is, in the order the pieces stack', () => {
    expect(derive('分からなかった')?.summaryEn).toEqual(['Plain', 'negative', 'past']);
    expect(derive('食べさせられたくなかった')?.summaryEn).toEqual([
      'Plain',
      'causative',
      'passive or potential',
      'want to',
      'negative',
      'past',
    ]);
    expect(derive('学生でした')?.summaryEn).toEqual(['Polite', 'past']);
  });

  it('walks a long stack one ending at a time, each result a form that exists', () => {
    expect(ladder(derive('食べさせられたくなかった'))).toEqual([
      // The baseline names these `せる / させる`, covering both. A row about one
      // word says the one it actually used.
      'させる · causative → 食べさせる',
      'られる · passive, potential → 食べさせられる',
      'たい · want to → 食べさせられたい',
      'ない · negation → 食べさせられたくない',
      'た · past and completion → 食べさせられたくなかった',
    ]);
  });

  it('collapses an ending the analyzer splits finer than it is taught', () => {
    // Walking ます, ん, です, た in order would offer 行きませんです as a step.
    expect(ladder(derive('行きませんでした'))).toEqual([
      'ませんでした · polite past negative → 行きませんでした',
    ]);
    expect(ladder(derive('行きません'))).toEqual(['ません · polite negative → 行きません']);
  });

  it('reads である as the written copula, not the てある helper verb', () => {
    // IPADIC analyses である as だ (連用形, written で) followed by ある on its
    // own, which a token-by-token walk would match against sb-aux-aru (書いて
    // ある) rather than sb-copula-dearu. The run must collapse to である.
    expect(ladder(derive('猫である'))).toEqual(['である · written copula → 猫である']);
  });

  it('treats the て of a helper verb as a seam rather than a step', () => {
    expect(ladder(derive('読んでいる'))).toEqual([
      'ている · progressive, resulting state → 読んでいる',
    ]);
    expect(ladder(derive('見せてしまった'))).toEqual([
      'てしまう · completion, regret → 見せてしまう',
      'た · past and completion → 見せてしまった',
    ]);
  });

  it('explains an inflection that adds no ending of its own', () => {
    // The ば of 行けば is a word of its own, so only the analyzer's inflection
    // form is evidence that 行け is a conditional stem rather than an order.
    expect(ladder(derive('行けば'))).toEqual(['行け · conditional stem → 行け']);
    expect(ladder(derive('行け'))).toEqual(['行け · imperative → 行け']);
    expect(derive('行け')?.summaryEn).toEqual(['Plain', 'imperative']);
  });

  it('accounts for a volitional stem through the ending that follows it', () => {
    expect(ladder(derive('行こう'))).toEqual(['う · volitional → 行こう']);
    expect(derive('行こう')?.summaryEn).toEqual(['Plain', 'volitional']);
  });

  it('builds on a word class rather than a dictionary form when the head is one', () => {
    const derivation = derive('学生でした');

    expect(derivation?.baseSurface).toBe('学生');
    expect(derivation?.baseLabel).toBe('Noun');
    expect(ladder(derivation)).toEqual([
      'です · polite copula → 学生です',
      'た · past and completion → 学生でした',
    ]);
  });

  it('reads an i-adjective the same way as a verb', () => {
    expect(ladder(derive('高くない'))).toEqual(['ない · negation → 高くない']);
    expect(ladder(derive('大きかった'))).toEqual(['た · past and completion → 大きかった']);
  });

  it('says nothing about a word that was never inflected or added to', () => {
    expect(derive('猫')).toBeNull();
    expect(derive('分かる')).toBeNull();
    // IPADIC lists 書ける as its own entry rather than a potential of 書く, so
    // there is honestly no step to show.
    expect(derive('書ける')).toBeNull();
  });

  it('falls back to the word class for an ending the baseline does not cover', () => {
    // The baseline lists 過ぎ as a suffix, and the analyzer tags this 過ぎる as a
    // non-independent verb, so no entry matches. Saying it is an auxiliary is
    // less than the dataset could say, but it is still true.
    const derivation = derive('食べ過ぎ');

    expect(derivation?.baseSurface).toBe('食べる');
    expect(ladder(derivation)).toEqual(['過ぎる · auxiliary → 食べ過ぎ']);
    expect(derivation?.steps[0].detailEn).toBeNull();
  });

  it('works without a baseline, naming endings by their word class', () => {
    const derivation = deriveWord(wordAt(tokensFor('分からなかった'), 0), null);

    expect(ladder(derivation)).toEqual([
      'ない · auxiliary → 分からない',
      'た · auxiliary → 分からなかった',
    ]);
  });
});
