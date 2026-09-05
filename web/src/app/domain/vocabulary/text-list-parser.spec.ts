import { describe, expect, it } from 'vitest';
import { parseTextList } from './text-list-parser';

describe('parseTextList', () => {
  it('treats an untouched empty field as no entries and no ignored lines', () => {
    expect(parseTextList('')).toEqual({
      normalizedContent: '',
      entries: [],
      ignoredBlankLines: 0,
      duplicateLines: 0,
      nonJapaneseLines: 0,
    });
  });

  it('normalizes line endings, trims edges, and ignores blank lines', () => {
    expect(parseTextList(' 猫 \r\n\r犬\n\t\n青い 空 ')).toEqual({
      normalizedContent: '猫\n犬\n青い 空',
      entries: ['猫', '犬', '青い 空'],
      ignoredBlankLines: 2,
      duplicateLines: 0,
      nonJapaneseLines: 0,
    });
  });

  it('preserves literal punctuation and reports exact duplicates', () => {
    const parsed = parseTextList('する／やる\n猫・ねこ\n猫・ねこ');
    expect(parsed.entries).toEqual(['する／やる', '猫・ねこ', '猫・ねこ']);
    expect(parsed.duplicateLines).toBe(1);
  });

  it('counts non-Japanese lines without rejecting a mixed list', () => {
    const parsed = parseTextList('猫\ncat\n123\n犬');
    expect(parsed.nonJapaneseLines).toBe(2);
    expect(parsed.entries).toHaveLength(4);
  });
});
