import { describe, expect, it } from 'vitest';
import type { StoryCandidate } from './story-request';
import {
  checkStoryStructure,
  hasFormatFailure,
  normalizeCandidate,
  orderedSentences,
} from './story-structure';

function candidate(texts: readonly string[], titleJa = 'ねこの一日'): StoryCandidate {
  return {
    titleJa,
    sentences: texts.map((textJa, index) => ({ index, textJa })),
  };
}

const MICRO = { min: 4, max: 6 };
const FOUR = ['一。', '二。', '三。', '四。'];

describe('normalizeCandidate', () => {
  it('trims outer whitespace and leaves everything inside untouched', () => {
    const normalized = normalizeCandidate({
      titleJa: '\n ねこ \n',
      sentences: [{ index: 0, textJa: '  ねこは　ここに いる。 ' }],
    });

    expect(normalized.titleJa).toBe('ねこ');
    expect(normalized.sentences[0].textJa).toBe('ねこは　ここに いる。');
  });

  it('keeps surrogate pairs whole', () => {
    const normalized = normalizeCandidate(candidate([' \u{20B9F}の話。 ']));

    expect(normalized.sentences[0].textJa).toBe('\u{20B9F}の話。');
  });
});

describe('checkStoryStructure', () => {
  it('accepts a well-formed candidate inside the range', () => {
    expect(checkStoryStructure(candidate(FOUR), MICRO)).toEqual([]);
  });

  it('reports an empty title as a format failure', () => {
    const issues = checkStoryStructure(candidate(FOUR, ''), MICRO);

    expect(issues.map((issue) => issue.code)).toEqual(['title-empty']);
    expect(hasFormatFailure(issues)).toBe(true);
  });

  it('reports an empty sentence as a format failure', () => {
    const issues = checkStoryStructure(candidate(['一。', '', '三。', '四。']), MICRO);

    expect(issues.map((issue) => issue.code)).toContain('sentence-empty');
    expect(hasFormatFailure(issues)).toBe(true);
  });

  it('reports a duplicate index and the index it left missing', () => {
    const issues = checkStoryStructure(
      {
        titleJa: 'ねこ',
        sentences: [
          { index: 0, textJa: '一。' },
          { index: 1, textJa: '二。' },
          { index: 1, textJa: '三。' },
          { index: 3, textJa: '四。' },
        ],
      },
      MICRO,
    );

    expect(issues.map((issue) => issue.code)).toEqual(['duplicate-index', 'non-contiguous-index']);
    expect(issues[1].index).toBe(2);
  });

  it('reports indexes that do not start at zero', () => {
    const issues = checkStoryStructure(
      {
        titleJa: 'ねこ',
        sentences: [1, 2, 3, 4].map((index) => ({ index, textJa: '文。' })),
      },
      MICRO,
    );

    expect(issues.map((issue) => issue.code)).toEqual(['non-contiguous-index']);
    expect(issues[0].index).toBe(0);
  });

  it('treats a wrong sentence count as repairable, not as a format failure', () => {
    const issues = checkStoryStructure(candidate(['一。', '二。']), MICRO);

    expect(issues.map((issue) => issue.code)).toEqual(['sentence-count-out-of-range']);
    expect(issues[0].severity).toBe('repairable');
    expect(hasFormatFailure(issues)).toBe(false);
  });

  it('stops after reporting that there are no sentences at all', () => {
    const issues = checkStoryStructure(candidate([]), MICRO);

    expect(issues.map((issue) => issue.code)).toEqual(['no-sentences']);
  });
});

describe('orderedSentences', () => {
  it('orders by declared index rather than by emitted order', () => {
    const ordered = orderedSentences({
      titleJa: 'ねこ',
      sentences: [
        { index: 2, textJa: '三。' },
        { index: 0, textJa: '一。' },
        { index: 1, textJa: '二。' },
      ],
    });

    expect(ordered).toEqual(['一。', '二。', '三。']);
  });
});
