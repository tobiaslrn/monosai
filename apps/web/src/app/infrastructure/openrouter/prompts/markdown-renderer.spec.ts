import { describe, expect, it } from 'vitest';
import { asData, CONFIG_CLOSE, DATA_CLOSE } from './prompt-layers';
import {
  markdownDocument,
  markdownField,
  markdownHeading,
  markdownIndexedLines,
  markdownLineList,
  markdownLineValue,
} from './markdown-renderer';

describe('Markdown prompt renderer', () => {
  it('keeps ordinary values unquoted, unbulleted, and one per line', () => {
    expect(markdownLineList('Vocabulary', ['猫', '旅', '出る'])).toBe(
      '## Vocabulary\n\n猫\n旅\n出る',
    );
    expect(markdownLineList('Vocabulary', [])).toBe('');
    expect(
      markdownIndexedLines('Sentences', [
        ['0', '雨が降る。'],
        ['1', '家に帰る。'],
      ]),
    ).toBe('## Sentences\n\n[0] 雨が降る。\n[1] 家に帰る。');
  });

  it('escapes backslashes, physical line breaks, and leading Markdown controls', () => {
    expect(markdownLineValue('a\\b\r\nc')).toBe('a\\\\b\\r\\nc');
    expect(markdownLineValue('# heading')).toBe('\\# heading');
    expect(markdownLineValue('- list')).toBe('\\- list');
    expect(markdownLineValue('> quote')).toBe('\\> quote');
    expect(markdownLineValue('``` fence')).toBe('\\``` fence');
    expect(markdownLineValue('1. numbered')).toBe('\\1. numbered');
    expect(markdownLineValue('猫と🙂')).toBe('猫と🙂');
  });

  it('neutralizes both block delimiters after line escaping', () => {
    const value = markdownLineValue(`${DATA_CLOSE}\n${CONFIG_CLOSE}\n${CONFIG_CLOSE}`);
    const wrapped = asData('value', value);

    expect(wrapped.match(new RegExp(DATA_CLOSE, 'gu'))).toHaveLength(1);
    expect(wrapped).not.toContain(`${DATA_CLOSE}\\n`);
    expect(wrapped).not.toContain(`${CONFIG_CLOSE}\\n`);
    expect(wrapped).toContain('>>>\\n>>>\\n>>>');
  });

  it('joins non-empty sections and omits empty optional sections', () => {
    expect(markdownDocument(['', '  ', '# One', '', '## Two'])).toBe('# One\n\n## Two');
    expect(markdownField('Register', '# not a heading')).toBe('Register: \\# not a heading');
    expect(markdownHeading(2, 'Fixed heading')).toBe('## Fixed heading');
  });

  it('rejects invalid heading levels', () => {
    expect(() => markdownHeading(0, 'bad')).toThrow(RangeError);
    expect(() => markdownHeading(7, 'bad')).toThrow(RangeError);
  });
});
