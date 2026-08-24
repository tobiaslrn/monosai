import { describe, expect, it } from 'vitest';
import type { ReviewedFinding } from '../ai/grammar-review-request';
import type { GrammarFinding } from './records';
import { sentenceId } from '../shared/ids';
import { concernCount, normalizeReview } from './grammar-normalization';

const S1 = sentenceId('s1');
const S2 = sentenceId('s2');

function finding(overrides: Partial<ReviewedFinding> = {}): ReviewedFinding {
  return {
    sentenceId: S1,
    label: 'te-form',
    explanationEn: 'Connects two clauses.',
    confidence: 'high',
    inProfile: true,
    ...overrides,
  };
}

describe('normalizeReview', () => {
  const sentenceIds = [S1, S2];

  it('drops a finding naming a sentence outside the batch', () => {
    const unknownSentence = sentenceId('unknown');
    const textById = new Map([[S1, 'これはテストです。']]);

    const result = normalizeReview(
      sentenceIds,
      { findings: [finding({ sentenceId: unknownSentence })] },
      textById,
    );

    expect(result).toEqual([]);
  });

  it('drops a finding with an out-of-range offset', () => {
    const text = 'これはテストです。';
    const textById = new Map([[S1, text]]);
    const input = finding({ startUtf16: 0, endUtf16: text.length + 5 });

    const result = normalizeReview(sentenceIds, { findings: [input] }, textById);

    expect(result).toEqual([]);
  });

  it('drops a finding with a reversed range', () => {
    const text = 'これはテストです。';
    const textById = new Map([[S1, text]]);
    const input = finding({ startUtf16: 4, endUtf16: 2 });

    const result = normalizeReview(sentenceIds, { findings: [input] }, textById);

    expect(result).toEqual([]);
  });

  it('drops a finding with a non-integer offset', () => {
    const text = 'これはテストです。';
    const textById = new Map([[S1, text]]);
    const input = finding({ startUtf16: 1.5, endUtf16: 4 });

    const result = normalizeReview(sentenceIds, { findings: [input] }, textById);

    expect(result).toEqual([]);
  });

  it('drops a finding whose offset splits a surrogate pair', () => {
    // U+20000 is outside the BMP and takes two UTF-16 code units; offset 1
    // lands between its high and low surrogate.
    const text = `${String.fromCodePoint(0x20000)}です。`;
    const textById = new Map([[S1, text]]);
    const input = finding({ startUtf16: 1, endUtf16: 3 });

    const result = normalizeReview(sentenceIds, { findings: [input] }, textById);

    expect(result).toEqual([]);
  });

  it('keeps a valid offset range untouched', () => {
    const text = 'これはテストです。';
    const textById = new Map([[S1, text]]);
    const input = finding({ startUtf16: 2, endUtf16: 5 });

    const result = normalizeReview(sentenceIds, { findings: [input] }, textById);

    expect(result).toEqual([input]);
  });

  it('drops a finding with a blank label', () => {
    const textById = new Map([[S1, 'これはテストです。']]);

    const result = normalizeReview(
      sentenceIds,
      { findings: [finding({ label: '   ' })] },
      textById,
    );

    expect(result).toEqual([]);
  });

  it('drops a finding with a blank explanation', () => {
    const textById = new Map([[S1, 'これはテストです。']]);

    const result = normalizeReview(
      sentenceIds,
      { findings: [finding({ explanationEn: '' })] },
      textById,
    );

    expect(result).toEqual([]);
  });

  it('deduplicates findings and keeps at most three per sentence, prioritizing concerns', () => {
    const textById = new Map([[S1, 'これはテストです。']]);
    const findings = [
      finding({ label: 'a', explanationEn: 'first' }),
      finding({ label: 'a', explanationEn: 'duplicate' }),
      finding({ label: 'b', explanationEn: 'second' }),
      finding({ label: 'c', explanationEn: 'concern', inProfile: false }),
      finding({ label: 'd', explanationEn: 'fourth' }),
    ];

    const result = normalizeReview(sentenceIds, { findings }, textById);

    expect(result.map((item) => item.label)).toEqual(['c', 'a', 'b']);
  });
});

describe('concernCount', () => {
  it('counts only findings that are not in the profile', () => {
    const reviewed: readonly ReviewedFinding[] = [
      finding({ inProfile: true }),
      finding({ inProfile: false }),
      finding({ inProfile: false }),
    ];

    expect(concernCount(reviewed)).toBe(2);
  });

  it('works for stored grammar findings as well as reviewed findings', () => {
    const stored: readonly GrammarFinding[] = [
      { label: 'a', explanationEn: 'x', confidence: 'low', inProfile: false },
      { label: 'b', explanationEn: 'y', confidence: 'low', inProfile: true },
    ];

    expect(concernCount(stored)).toBe(1);
  });
});
