import { describe, expect, it } from 'vitest';
import { DomMarkupTextExtractor } from '../../infrastructure/anki/dom-markup-text';
import type { MarkupTextExtractor } from './markup-text';
import { extractVisibleText } from './field-extraction';

const extractor = new DomMarkupTextExtractor();

function extract(raw: string | undefined): ReturnType<typeof extractVisibleText> {
  return extractVisibleText(raw, extractor);
}

describe('extractVisibleText', () => {
  it('rejects a field the note does not have', () => {
    const result = extract(undefined);
    expect(result).toEqual({ ok: false, error: 'missing' });
  });

  it('rejects an empty or whitespace-only value', () => {
    expect(extract('')).toEqual({ ok: false, error: 'empty' });
    expect(extract('   \n\t ')).toEqual({ ok: false, error: 'empty' });
    expect(extract('<div><br></div>')).toEqual({ ok: false, error: 'empty' });
    expect(extract('&nbsp;')).toEqual({ ok: false, error: 'empty' });
  });

  it('rejects markup that cannot produce visible text at all', () => {
    const broken: MarkupTextExtractor = { toVisibleText: () => null };
    expect(extractVisibleText('anything', broken)).toEqual({ ok: false, error: 'unsafe' });
  });

  it('accepts a plain expression', () => {
    expect(extract('ねこ')).toEqual({ ok: true, value: 'ねこ' });
  });

  it('normalizes line endings to LF', () => {
    expect(extract('一\r\n二\r三')).toEqual({ ok: true, value: '一\n二\n三' });
  });

  it('trims the outside while preserving the inside', () => {
    expect(extract('  お腹 が 空いた  ')).toEqual({ ok: true, value: 'お腹 が 空いた' });
  });

  it('keeps a sentence-like value rather than choosing a word from it', () => {
    expect(extract('これはペンです。')).toEqual({ ok: true, value: 'これはペンです。' });
  });

  it('keeps slash-separated variants as one literal value', () => {
    expect(extract('わたし/わたくし')).toEqual({ ok: true, value: 'わたし/わたくし' });
  });

  it('keeps an internal line break as part of the expression', () => {
    expect(extract('<div>一</div><div>二</div>')).toEqual({ ok: true, value: '一\n二' });
  });

  it('does not convert between kana and kanji', () => {
    expect(extract('たべる')).toEqual({ ok: true, value: 'たべる' });
    expect(extract('食べる')).toEqual({ ok: true, value: '食べる' });
  });
});
