import { describe, expect, it } from 'vitest';
import { findingsCoveringToken, tokensCoveredByConcerns, type SpannedToken } from './finding-spans';
import type { GrammarFinding } from './records';

const TOKENS: readonly SpannedToken[] = [
  { id: 'a', startUtf16: 0, endUtf16: 2 },
  { id: 'b', startUtf16: 2, endUtf16: 5 },
  { id: 'c', startUtf16: 5, endUtf16: 6 },
];

function finding(overrides: Partial<GrammarFinding> = {}): GrammarFinding {
  return {
    label: 'て-form',
    explanationEn: 'Joins two clauses.',
    confidence: 'medium',
    inProfile: false,
    ...overrides,
  };
}

describe('tokensCoveredByConcerns', () => {
  it('marks every token a concern span overlaps', () => {
    const covered = tokensCoveredByConcerns([finding({ startUtf16: 1, endUtf16: 3 })], TOKENS);

    expect([...covered]).toEqual(['a', 'b']);
  });

  it('marks nothing for a finding without a span', () => {
    expect(tokensCoveredByConcerns([finding()], TOKENS).size).toBe(0);
  });

  it('marks nothing for a finding that is inside the profile', () => {
    const inProfile = finding({ inProfile: true, startUtf16: 0, endUtf16: 6 });

    expect(tokensCoveredByConcerns([inProfile], TOKENS).size).toBe(0);
  });

  it('treats span bounds as half open, so an adjacent token is not marked', () => {
    const covered = tokensCoveredByConcerns([finding({ startUtf16: 0, endUtf16: 2 })], TOKENS);

    expect([...covered]).toEqual(['a']);
  });
});

describe('findingsCoveringToken', () => {
  it('keeps a covering finding even when it is inside the profile', () => {
    const covering = finding({ inProfile: true, startUtf16: 2, endUtf16: 5 });

    expect(findingsCoveringToken([covering], TOKENS[1])).toEqual([covering]);
  });

  it('drops a finding that has no span, because it was never about one word', () => {
    expect(findingsCoveringToken([finding()], TOKENS[1])).toEqual([]);
  });

  it('drops a finding whose span lies elsewhere in the sentence', () => {
    expect(findingsCoveringToken([finding({ startUtf16: 0, endUtf16: 2 })], TOKENS[2])).toEqual([]);
  });
});
