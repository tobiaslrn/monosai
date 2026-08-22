import { describe, expect, it } from 'vitest';
import { parseTextList } from './text-list-parser';

describe('parseTextList', () => {
  it('normalizes line endings, trims edges, and ignores blank lines', () => {
    expect(parseTextList(' 猫 \r\n\r犬\n\t\n青い 空 ')).toEqual({
      normalizedContent: '猫\n犬\n青い 空',
      entries: ['猫', '犬', '青い 空'],
      ignoredBlankLines: 2,
      duplicateLines: 0,
    });
  });

  it('preserves literal punctuation and reports exact duplicates', () => {
    const parsed = parseTextList('する／やる\n猫・ねこ\n猫・ねこ');
    expect(parsed.entries).toEqual(['する／やる', '猫・ねこ', '猫・ねこ']);
    expect(parsed.duplicateLines).toBe(1);
  });
});
