import { describe, expect, it } from 'vitest';
import { DomMarkupTextExtractor } from '../../infrastructure/anki/dom-markup-text';
import type { MarkupTextExtractor } from './markup-text';
import { extractExpression, extractVisibleText } from './field-extraction';

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

describe('extractExpression', () => {
  function expression(raw: string): ReturnType<typeof extractExpression> {
    return extractExpression(raw, extractor);
  }

  it('reads everything extractVisibleText reads', () => {
    expect(expression(' <b>ねこ</b> ')).toEqual({ ok: true, value: 'ねこ' });
    expect(extractExpression(undefined, extractor)).toEqual({ ok: false, error: 'missing' });
    expect(expression('<div><br></div>')).toEqual({ ok: false, error: 'empty' });
  });

  it('keeps the base of ruby markup', () => {
    expect(expression('<ruby>食<rt>た</rt></ruby>べる')).toEqual({ ok: true, value: '食べる' });
  });

  it('drops Anki bracket readings the way its kanji filter does', () => {
    expect(expression('食[た]べる')).toEqual({ ok: true, value: '食べる' });
    expect(expression('漢字[かんじ]')).toEqual({ ok: true, value: '漢字' });
    // A space before a reading only marks where the reading starts.
    expect(expression('私[わたし]の 名前[なまえ]')).toEqual({ ok: true, value: '私の名前' });
    expect(expression('<b>日本[にほん]</b>')).toEqual({ ok: true, value: '日本' });
  });

  it('reads a non-breaking space before a reading as a plain space, as Anki does', () => {
    // Anki's editor writes `&nbsp;` where the learner typed the separating space.
    expect(expression('私[わたし]の&nbsp;名前[なまえ]')).toEqual({ ok: true, value: '私の名前' });
    expect(expression('食[た]べ\u00a0物[もの]')).toEqual({ ok: true, value: '食べ物' });
  });

  it('leaves a sound tag in place, as Anki does', () => {
    expect(expression('犬[sound:inu.mp3]')).toEqual({ ok: true, value: '犬[sound:inu.mp3]' });
  });

  it('keeps the answer of a cloze and drops its hint', () => {
    expect(expression('{{c1::漢字}}')).toEqual({ ok: true, value: '漢字' });
    expect(expression('{{c1::漢字::kanji}}を書く')).toEqual({ ok: true, value: '漢字を書く' });
    expect(expression('{{c1::猫}}と{{c2::犬::animal}}')).toEqual({ ok: true, value: '猫と犬' });
  });

  it('unwraps a cloze nested inside another', () => {
    expect(expression('{{c1::大きな{{c2::犬::noun}}::phrase}}')).toEqual({
      ok: true,
      value: '大きな犬',
    });
  });

  it('reads a cloze whose answer carries bracket readings', () => {
    expect(expression('{{c1::食[た]べる::verb}}')).toEqual({ ok: true, value: '食べる' });
  });

  it('rejects a value that is only an empty cloze', () => {
    expect(expression('{{c1::}}')).toEqual({ ok: false, error: 'empty' });
  });
});
