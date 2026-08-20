import { describe, expect, it } from 'vitest';
import { tokensCoveredByConcerns, type SpannedToken } from './finding-spans';
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
