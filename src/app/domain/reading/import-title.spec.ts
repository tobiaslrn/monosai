import { describe, expect, it } from 'vitest';
import {
  FALLBACK_READING_TITLE,
  MAXIMUM_DERIVED_TITLE_LENGTH,
  resolveTitle,
  titleFromPastedText,
} from './import-title';

describe('titleFromPastedText', () => {
  it('uses the first meaningful line', () => {
    expect(titleFromPastedText('\n\n  第一章  \n猫が寝た。')).toBe('第一章');
  });

  it('uses the first sentence rather than a whole prose line', () => {
    expect(titleFromPastedText('吾輩は猫である。名前はまだ無い。')).toBe('吾輩は猫である。');
  });

  it('skips invisible and punctuation-only lines', () => {
    expect(titleFromPastedText('\u200b\u200c\n。。。\n猫が走る。')).toBe('猫が走る。');
  });

  it('falls back when the text is only whitespace', () => {
    expect(titleFromPastedText('  \n\t ')).toBe(FALLBACK_READING_TITLE);
  });

  it('truncates a long first line for display', () => {
    const derived = titleFromPastedText('猫'.repeat(500));
    expect(Array.from(derived)).toHaveLength(MAXIMUM_DERIVED_TITLE_LENGTH);
  });
});

describe('resolveTitle', () => {
  it('prefers what the learner typed', () => {
    expect(resolveTitle('  わたしの章 ', '第一章')).toBe('わたしの章');
  });

  it('falls back to the derived suggestion when the field was emptied', () => {
    expect(resolveTitle('   ', '第一章')).toBe('第一章');
  });

  it('never resolves to an empty title', () => {
    expect(resolveTitle('', '')).toBe(FALLBACK_READING_TITLE);
  });

  it('falls back from an invisible or punctuation-only entered title', () => {
    expect(resolveTitle('\u200b。。。', '猫が寝た。')).toBe('猫が寝た。');
  });
});
