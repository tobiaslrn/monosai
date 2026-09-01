import { describe, expect, it } from 'vitest';
import { parseTextList } from '../../domain/vocabulary/text-list-parser';
import { textListPreviewLabel } from './text-list-preview';

describe('textListPreviewLabel', () => {
  it('uses singular entry grammar and does not invent a blank line for an empty field', () => {
    expect(textListPreviewLabel(parseTextList(''))).toBe('0 non-empty entries');
    expect(textListPreviewLabel(parseTextList('猫'))).toBe('1 non-empty entry');
  });

  it('pluralizes blank and duplicate counts independently', () => {
    expect(textListPreviewLabel(parseTextList('猫\n猫\n\n犬'))).toBe(
      '3 non-empty entries · 1 exact duplicate will be merged · 1 blank line ignored',
    );
    expect(textListPreviewLabel(parseTextList('猫\n猫\n犬\n犬\n\n'))).toBe(
      '4 non-empty entries · 2 exact duplicates will be merged · 2 blank lines ignored',
    );
  });
});
