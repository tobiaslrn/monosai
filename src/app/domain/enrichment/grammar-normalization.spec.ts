import { describe, expect, it } from 'vitest';
import type { NormalizedFinding, ReviewedFinding } from '../ai/grammar-review-request';
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

function normalized(overrides: Partial<NormalizedFinding> = {}): NormalizedFinding {
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

  it('locates a quoted span and stores it as offsets', () => {
    const text = 'これはテストです。';
    const textById = new Map([[S1, text]]);

    const result = normalizeReview(
      sentenceIds,
      { findings: [finding({ spanJa: 'テスト' })] },
      textById,
    );

    expect(result).toEqual([normalized({ startUtf16: 3, endUtf16: 6 })]);
    expect(text.slice(3, 6)).toBe('テスト');
  });

  it('keeps a finding whose span is not in its sentence, without the highlight', () => {
    const textById = new Map([[S1, 'これはテストです。']]);

    const result = normalizeReview(
      sentenceIds,
      { findings: [finding({ spanJa: 'ありません' })] },
      textById,
    );

    // The label and the explanation are still worth showing; only the
    // highlight is lost.
    expect(result).toEqual([normalized()]);
  });

  it('keeps a finding with an empty span as a sentence-level observation', () => {
    const textById = new Map([[S1, 'これはテストです。']]);

    const result = normalizeReview(sentenceIds, { findings: [finding({ spanJa: '' })] }, textById);

    expect(result).toEqual([normalized()]);
  });

  it('takes the first occurrence of a repeated span', () => {
    const text = 'ねこがねこを見た。';
    const textById = new Map([[S1, text]]);

    const result = normalizeReview(
      sentenceIds,
      { findings: [finding({ spanJa: 'ねこ' })] },
      textById,
    );

    expect(result).toEqual([normalized({ startUtf16: 0, endUtf16: 2 })]);
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
    const reviewed: readonly NormalizedFinding[] = [
      normalized({ inProfile: true }),
      normalized({ inProfile: false }),
      normalized({ inProfile: false }),
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
