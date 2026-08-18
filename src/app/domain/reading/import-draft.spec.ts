import { describe, expect, it } from 'vitest';
import type { Token } from './token';
import {
  applyAnalysis,
  findSentence,
  mergeSentence,
  splitSentence,
  totalSentenceCount,
  unanalyzedSentences,
  type ImportDraft,
} from './import-draft';

function idFactory(prefix = 'new'): () => string {
  let counter = 0;
  return () => {
    counter += 1;
    return `${prefix}${String(counter)}`;
  };
}

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

/** One paragraph of two analyzed sentences, plus a second paragraph. */
function draft(): ImportDraft {
  return {
    paragraphs: [
      {
        id: 'p1',
        sourceText: '猫が寝た。犬も寝た。\n\n',
        sentences: [
          { id: 's1', text: '猫が寝た。', tokens: [token('猫')] },
          { id: 's2', text: '犬も寝た。', tokens: [token('犬')] },
        ],
      },
      {
        id: 'p2',
        sourceText: '鳥は飛んだ。',
        sentences: [{ id: 's3', text: '鳥は飛んだ。', tokens: [token('鳥')] }],
      },
    ],
  };
}

describe('splitSentence', () => {
  it('splits at the caret and keeps both halves in order', () => {
    const result = splitSentence(draft(), 's1', 3, idFactory());
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.draft.paragraphs[0].sentences.map((s) => s.text)).toEqual([
      '猫が寝',
      'た。',
      '犬も寝た。',
    ]);
  });

  it('keeps the original id on the first half so focus stays put', () => {
    const result = splitSentence(draft(), 's1', 3, idFactory());
    expect(result.ok && result.draft.paragraphs[0].sentences[0].id).toBe('s1');
    expect(result.ok && result.draft.paragraphs[0].sentences[1].id).toBe('new1');
  });

  it('marks both halves as needing re-analysis and reports them as changed', () => {
    const result = splitSentence(draft(), 's1', 3, idFactory());
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.changedSentenceIds).toEqual(['s1', 'new1']);
    expect(unanalyzedSentences(result.draft).map((s) => s.id)).toEqual(['s1', 'new1']);
    // The untouched sentence keeps the tokens it already had.
    expect(findSentence(result.draft, 's2')?.tokens).not.toBeNull();
  });

  it('preserves every character across a split', () => {
    const result = splitSentence(draft(), 's1', 3, idFactory());
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const rebuilt = result.draft.paragraphs[0].sentences
      .slice(0, 2)
      .map((s) => s.text)
      .join('');
    expect(rebuilt).toBe('猫が寝た。');
  });

  it('rejects an offset at either edge, which would create an empty sentence', () => {
    expect(splitSentence(draft(), 's1', 0, idFactory())).toMatchObject({
      ok: false,
      failure: { code: 'split-offset-out-of-range' },
    });
    expect(splitSentence(draft(), 's1', 5, idFactory())).toMatchObject({
      ok: false,
      failure: { code: 'split-offset-out-of-range' },
    });
  });

  it('rejects a split whose halves would be only whitespace', () => {
    const spaced: ImportDraft = {
      paragraphs: [
        {
          id: 'p1',
          sourceText: '猫 が寝た。',
          sentences: [{ id: 's1', text: '猫 が寝た。', tokens: null }],
        },
      ],
    };
    // Offset 1 would leave "猫" and " が寝た。" — both fine. Offset inside the
    // leading run of a whitespace-only half is what must be refused.
    const whitespaceOnly: ImportDraft = {
      paragraphs: [
        {
          id: 'p1',
          sourceText: '  猫。',
          sentences: [{ id: 's1', text: '  猫。', tokens: null }],
        },
      ],
    };
    expect(splitSentence(spaced, 's1', 1, idFactory()).ok).toBe(true);
    expect(splitSentence(whitespaceOnly, 's1', 2, idFactory())).toMatchObject({
      ok: false,
      failure: { code: 'split-produces-empty' },
    });
  });

  it('reports an unknown sentence rather than throwing', () => {
    expect(splitSentence(draft(), 'missing', 2, idFactory())).toMatchObject({
      ok: false,
      failure: { code: 'sentence-not-found' },
    });
  });

  it('leaves the original draft untouched', () => {
    const original = draft();
    splitSentence(original, 's1', 3, idFactory());
    expect(original.paragraphs[0].sentences).toHaveLength(2);
  });
});

describe('mergeSentence', () => {
  it('merges with the previous sentence and keeps the earlier id', () => {
    const result = mergeSentence(draft(), 's2', 'previous');
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.draft.paragraphs[0].sentences).toHaveLength(1);
    expect(result.draft.paragraphs[0].sentences[0]).toMatchObject({
      id: 's1',
      text: '猫が寝た。犬も寝た。',
      tokens: null,
    });
    expect(result.changedSentenceIds).toEqual(['s1']);
  });

  it('merges with the next sentence, producing the same result as the reverse call', () => {
    const forward = mergeSentence(draft(), 's1', 'next');
    const backward = mergeSentence(draft(), 's2', 'previous');
    expect(forward.ok && backward.ok && forward.draft).toEqual(backward.ok && backward.draft);
  });

  it('refuses to merge past the start of a paragraph', () => {
    expect(mergeSentence(draft(), 's1', 'previous')).toMatchObject({
      ok: false,
      failure: { code: 'no-previous-sentence' },
    });
  });

  it('refuses to merge past the end of a paragraph', () => {
    expect(mergeSentence(draft(), 's2', 'next')).toMatchObject({
      ok: false,
      failure: { code: 'no-next-sentence' },
    });
  });

  it('never merges across a paragraph boundary', () => {
    // s3 is the only sentence of the second paragraph; merging backwards must
    // not reach into the first paragraph.
    expect(mergeSentence(draft(), 's3', 'previous')).toMatchObject({
      ok: false,
      failure: { code: 'no-previous-sentence' },
    });
  });

  it('leaves other paragraphs alone', () => {
    const result = mergeSentence(draft(), 's2', 'previous');
    expect(result.ok && result.draft.paragraphs[1]).toEqual(draft().paragraphs[1]);
  });
});

describe('split and merge round trip', () => {
  it('restores the original sentence text', () => {
    const split = splitSentence(draft(), 's1', 3, idFactory());
    expect(split.ok).toBe(true);
    if (!split.ok) {
      return;
    }
    const merged = mergeSentence(split.draft, 'new1', 'previous');
    expect(merged.ok && merged.draft.paragraphs[0].sentences.map((s) => s.text)).toEqual([
      '猫が寝た。',
      '犬も寝た。',
    ]);
  });
});

describe('applyAnalysis', () => {
  it('fills in tokens only for the sentences that were re-analyzed', () => {
    const split = splitSentence(draft(), 's1', 3, idFactory());
    expect(split.ok).toBe(true);
    if (!split.ok) {
      return;
    }
    const applied = applyAnalysis(
      split.draft,
      new Map([
        ['s1', [token('猫が寝')]],
        ['new1', [token('た。')]],
      ]),
    );
    expect(unanalyzedSentences(applied)).toEqual([]);
    expect(findSentence(applied, 's2')?.tokens).toEqual([token('犬')]);
  });
});

describe('totalSentenceCount', () => {
  it('counts sentences across every paragraph', () => {
    expect(totalSentenceCount(draft())).toBe(3);
  });
});
