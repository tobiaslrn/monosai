import { describe, expect, it } from 'vitest';
import type { Token } from './token';
import { applyAnalysis, unanalyzedSentences, type ImportDraft } from './import-draft';

function token(surface: string): Token {
  return {
    id: `t-${surface}`,
    startUtf16: 0,
    endUtf16: surface.length,
    surface,
    dictionaryKeys: [],
    isPunctuation: false,
  };
}

function draft(): ImportDraft {
  return {
    paragraphs: [
      {
        id: 'p1',
        sourceText: '猫が寝た。犬も寝た。\n\n',
        sentences: [
          { id: 's1', text: '猫が寝た。', tokens: null },
          { id: 's2', text: '犬も寝た。', tokens: [token('犬')] },
        ],
      },
      {
        id: 'p2',
        sourceText: '鳥は飛んだ。',
        sentences: [{ id: 's3', text: '鳥は飛んだ。', tokens: null }],
      },
    ],
  };
}

describe('unanalyzedSentences', () => {
  it('finds pending sentences across all preserved paragraphs', () => {
    expect(unanalyzedSentences(draft()).map((sentence) => sentence.id)).toEqual(['s1', 's3']);
  });
});

describe('applyAnalysis', () => {
  it('fills analysis by sentence id without changing paragraph formatting', () => {
    const original = draft();
    const analyzed = applyAnalysis(
      original,
      new Map([
        ['s1', [token('猫')]],
        ['s3', [token('鳥')]],
      ]),
    );

    expect(unanalyzedSentences(analyzed)).toEqual([]);
    expect(analyzed.paragraphs.map((paragraph) => paragraph.sourceText)).toEqual([
      '猫が寝た。犬も寝た。\n\n',
      '鳥は飛んだ。',
    ]);
    expect(analyzed.paragraphs[0].sentences[1].tokens).toEqual([token('犬')]);
  });

  it('leaves sentences without a returned analysis untouched', () => {
    const analyzed = applyAnalysis(draft(), new Map([['s1', [token('猫')]]]));

    expect(analyzed.paragraphs[1].sentences[0].tokens).toBeNull();
  });
});
