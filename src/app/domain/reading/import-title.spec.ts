import { describe, expect, it } from 'vitest';
import {
  FALLBACK_READING_TITLE,
  MAXIMUM_DERIVED_TITLE_LENGTH,
  resolveTitle,
  titleFromFileName,
  titleFromPastedText,
} from './import-title';

describe('titleFromFileName', () => {
  it('drops the extension', () => {
    expect(titleFromFileName('第一章.txt')).toBe('第一章');
  });

  it('keeps everything before the last dot', () => {
    expect(titleFromFileName('notes.chapter.one.txt')).toBe('notes.chapter.one');
  });

  it('keeps a dotfile name whole, because it has no extension to drop', () => {
    expect(titleFromFileName('.gitignore')).toBe('.gitignore');
  });

  it('ignores directory components', () => {
    expect(titleFromFileName('C:\\texts\\第一章.txt')).toBe('第一章');
    expect(titleFromFileName('texts/第一章.txt')).toBe('第一章');
  });

  it('falls back when the name is only an extension or whitespace', () => {
    expect(titleFromFileName('   .txt')).toBe(FALLBACK_READING_TITLE);
  });

  it('truncates a very long name', () => {
    const derived = titleFromFileName(`${'あ'.repeat(200)}.txt`);
    expect(Array.from(derived)).toHaveLength(MAXIMUM_DERIVED_TITLE_LENGTH);
    expect(derived.endsWith('…')).toBe(true);
  });
});

describe('titleFromPastedText', () => {
  it('uses the first non-empty line', () => {
    expect(titleFromPastedText('\n\n  第一章  \n猫が寝た。')).toBe('第一章');
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
});
