import { describe, expect, it } from 'vitest';
import {
  compileStructuralBaseline,
  type StructuralBaselineEntry,
} from '../language/structural-baseline';
import type { Token } from './token';
import { wordAt } from './token-grouping';
import { composeWord } from './word-composition';

const POLITE_ENDING: StructuralBaselineEntry = {
  id: 'sb-aux-masu',
  category: 'auxiliary',
  forms: ['ます'],
  partsOfSpeech: ['auxiliary'],
  nameEn: 'ます (polite verb ending)',
  descriptionEn: 'Makes a verb polite, inflecting to ません, ました, and ましょう.',
};

const baseline = compileStructuralBaseline({ version: '1', entries: [POLITE_ENDING] });

function token(surface: string, partOfSpeech: Token['partOfSpeech'], lemma?: string): Token {
  return {
    id: `t-${surface}`,
    startUtf16: 0,
    endUtf16: surface.length,
    surface,
    ...(lemma === undefined ? {} : { lemma }),
    ...(partOfSpeech === undefined ? {} : { partOfSpeech }),
    dictionaryKeys: [],
    isPunctuation: false,
  };
}

const POLITE_VERB: readonly Token[] = [
  token('飲み', 'verb', '飲む'),
  token('ます', 'auxiliary', 'ます'),
];

describe('composeWord', () => {
  it('names the stem and the ending in the order they are stacked', () => {
    expect(composeWord(wordAt(POLITE_VERB, 0), baseline)).toEqual([
      {
        tokenId: 't-飲み',
        surface: '飲み',
        label: 'Verb',
        detailEn: 'Dictionary form 飲む',
      },
      {
        tokenId: 't-ます',
        surface: 'ます',
        label: 'ます (polite verb ending)',
        detailEn: 'Makes a verb polite, inflecting to ません, ました, and ましょう.',
      },
    ]);
  });

  it('says nothing about a word the analyzer did not split', () => {
    // The entry above the section already carries everything there is to say.
    const single = [token('猫', 'noun', '猫')];

    expect(composeWord(wordAt(single, 0), baseline)).toEqual([]);
  });

  it('falls back to the word class for an ending the baseline does not cover', () => {
    const uncovered: readonly Token[] = [
      token('高', 'adjective-i', '高い'),
      token('すぎ', 'suffix', 'すぎる'),
    ];

    expect(composeWord(wordAt(uncovered, 0), baseline)[1]).toEqual({
      tokenId: 't-すぎ',
      surface: 'すぎ',
      label: 'Suffix',
      detailEn: null,
    });
  });

  it('leaves the head undescribed when the page already shows its dictionary form', () => {
    const uninflected: readonly Token[] = [
      token('元気', 'adjective-na', '元気'),
      token('です', 'auxiliary', 'です'),
    ];

    expect(composeWord(wordAt(uninflected, 0), baseline)[0]).toMatchObject({
      label: 'na-adjective',
      detailEn: null,
    });
  });

  it('names what it can when no baseline is loaded', () => {
    expect(composeWord(wordAt(POLITE_VERB, 0), null).map((part) => part.label)).toEqual([
      'Verb',
      'Auxiliary',
    ]);
  });
});
