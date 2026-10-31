import { describe, expect, it } from 'vitest';
import type { ReaderSentence } from '../../application/reading/reader.store';
import { unknownWordsIn, wordGrammarFor } from './reader-selection-view';

type Token = Parameters<typeof wordGrammarFor>[0];
type Aids = Parameters<typeof wordGrammarFor>[1];

function sentence(
  tokens: readonly { id: string; surface: string; validation: string | null }[],
): ReaderSentence {
  return {
    tokens: tokens.map(({ id, surface }) => ({ id, surface })),
    statuses: new Map(
      tokens.flatMap(({ id, validation }) =>
        validation === null ? [] : [[id, { validation: { category: validation } }]],
      ),
    ),
  } as unknown as ReaderSentence;
}

describe('unknownWordsIn', () => {
  it('says nothing about a sentence with no statuses yet', () => {
    expect(unknownWordsIn(undefined)).toEqual([]);
    expect(unknownWordsIn({ tokens: [], statuses: null } as unknown as ReaderSentence)).toEqual([]);
  });

  it('names each uncovered surface once and leaves unmarked words out', () => {
    const words = unknownWordsIn(
      sentence([
        { id: 't1', surface: '猫', validation: 'not-in-snapshot' },
        { id: 't2', surface: 'は', validation: 'policy-exception' },
        { id: 't3', surface: '猫', validation: 'not-in-snapshot' },
        { id: 't4', surface: '犬', validation: null },
      ]),
    );

    expect(words).toEqual([{ surface: '猫', label: 'Not in current vocabulary' }]);
  });
});

describe('wordGrammarFor', () => {
  const token = { id: 't1', surfaceStart: 0, surfaceEnd: 1 } as unknown as Token;

  it('reports a sentence that has no analysis', () => {
    expect(wordGrammarFor(token, { grammar: null, grammarStale: false })).toEqual({
      findings: [],
      sentenceFindings: [],
      analyzed: false,
      stale: false,
    });
  });

  it('carries the staleness of an analysis with no findings', () => {
    const aids = { grammar: { findings: [] }, grammarStale: true } as unknown as Aids;

    expect(wordGrammarFor(token, aids)).toEqual({
      findings: [],
      sentenceFindings: [],
      analyzed: true,
      stale: true,
    });
  });
});
