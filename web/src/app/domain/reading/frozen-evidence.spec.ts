import { describe, expect, it } from 'vitest';
import { vocabularyItemId } from '../shared/ids';
import { withFrozenEvidence } from './frozen-evidence';
import type { TokenStatusAssignment, TokenValidation } from './validation';

function status(tokenId: string, validation: TokenValidation): TokenStatusAssignment {
  return { tokenId, validation };
}

const exception: TokenValidation = {
  category: 'policy-exception',
  exceptionId: 'ひかりくん',
  explanationEn: 'Character names are allowed by the policy.',
};
const known: TokenValidation = {
  category: 'anki-exact',
  vocabularyItemIds: [vocabularyItemId('v1')],
};
const notInSnapshot: TokenValidation = { category: 'not-in-snapshot' };
const unresolved: TokenValidation = { category: 'unknown', reason: 'unresolved-after-repair' };

describe('withFrozenEvidence', () => {
  it('keeps a policy exception the current snapshot cannot cover', () => {
    const merged = withFrozenEvidence([status('t0', notInSnapshot)], [status('t0', exception)]);

    expect(merged).toEqual([status('t0', exception)]);
  });

  it('keeps a word the story was accepted on after it leaves the snapshot', () => {
    const merged = withFrozenEvidence([status('t0', notInSnapshot)], [status('t0', known)]);

    expect(merged).toEqual([status('t0', known)]);
  });

  it('lets a word learned since the story was written stop being uncovered', () => {
    const merged = withFrozenEvidence([status('t0', known)], [status('t0', unresolved)]);

    expect(merged).toEqual([status('t0', known)]);
  });

  it('leaves a word uncovered when neither source covers it', () => {
    const merged = withFrozenEvidence([status('t0', notInSnapshot)], [status('t0', unresolved)]);

    expect(merged).toEqual([status('t0', notInSnapshot)]);
  });

  it('keeps the current status of a token the frozen evidence does not name', () => {
    const merged = withFrozenEvidence(
      [status('t0', notInSnapshot), status('t1', notInSnapshot)],
      [status('t0', exception)],
    );

    expect(merged).toEqual([status('t0', exception), status('t1', notInSnapshot)]);
  });

  it('returns the current statuses unchanged without frozen evidence', () => {
    const current = [status('t0', notInSnapshot)];

    expect(withFrozenEvidence(current, [])).toBe(current);
  });
});
