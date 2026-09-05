import { describe, expect, it } from 'vitest';
import { buildExcerpt, EXCERPT_LENGTH } from './excerpt';

describe('buildExcerpt', () => {
  it('keeps a short opening whole', () => {
    expect(buildExcerpt('猫が好きです。')).toBe('猫が好きです。');
  });

  it('collapses the line breaks a pasted import carries', () => {
    expect(buildExcerpt('一行目です。\n\n  二行目です。')).toBe('一行目です。 二行目です。');
  });

  it('truncates a long opening to the stored bound', () => {
    const excerpt = buildExcerpt('あ'.repeat(500));
    expect(excerpt).toHaveLength(EXCERPT_LENGTH);
  });

  it('returns an empty string for text that is only whitespace', () => {
    expect(buildExcerpt('   \n  ')).toBe('');
  });
});
