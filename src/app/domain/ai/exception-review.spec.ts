import { describe, expect, it } from 'vitest';
import { applyDecisions, noApprovals, type ExceptionCandidate } from './exception-review';

const CANDIDATES: readonly ExceptionCandidate[] = [
  { id: 'c1', surface: '図書館', contextsJa: ['図書館へ行った。'] },
  { id: 'c2', surface: '匂い', lemma: '匂い', contextsJa: ['匂いがした。'] },
];

const REASON = 'A place name the policy allows because the learner named it.';

describe('applyDecisions', () => {
  it('turns an approval into a policy exception and never an Anki category', () => {
    const outcome = applyDecisions(CANDIDATES, [
      { candidateId: 'c1', decision: 'approved', explanationEn: REASON },
    ]);

    expect(outcome.approvals.get('c1')).toEqual({
      category: 'policy-exception',
      exceptionId: 'c1',
      explanationEn: REASON,
    });
    expect(outcome.stillUnknown).toEqual(['c2']);
  });

  it('leaves a rejected candidate unknown without discarding the answer', () => {
    const outcome = applyDecisions(CANDIDATES, [
      { candidateId: 'c1', decision: 'rejected', explanationEn: REASON },
      { candidateId: 'c2', decision: 'approved', explanationEn: REASON },
    ]);

    expect(outcome.stillUnknown).toEqual(['c1']);
    expect(outcome.discarded).toEqual([]);
  });

  it('leaves an unreviewed candidate unknown', () => {
    const outcome = applyDecisions(CANDIDATES, []);

    expect(outcome.approvals.size).toBe(0);
    expect(outcome.stillUnknown).toEqual(['c1', 'c2']);
  });

  it('discards a decision naming a candidate that was never sent', () => {
    const outcome = applyDecisions(CANDIDATES, [
      { candidateId: 'nope', decision: 'approved', explanationEn: REASON },
    ]);

    expect(outcome.approvals.size).toBe(0);
    expect(outcome.discarded).toEqual([{ candidateId: 'nope', code: 'unknown-candidate' }]);
  });

  it('withdraws both answers when one candidate is decided twice', () => {
    const outcome = applyDecisions(CANDIDATES, [
      { candidateId: 'c1', decision: 'approved', explanationEn: REASON },
      { candidateId: 'c1', decision: 'approved', explanationEn: REASON },
    ]);

    expect(outcome.approvals.size).toBe(0);
    expect(outcome.stillUnknown).toEqual(['c1', 'c2']);
    expect(outcome.discarded).toEqual([{ candidateId: 'c1', code: 'duplicate-candidate' }]);
  });

  it('refuses an empty explanation', () => {
    const outcome = applyDecisions(CANDIDATES, [
      { candidateId: 'c1', decision: 'approved', explanationEn: '   ' },
    ]);

    expect(outcome.approvals.size).toBe(0);
    expect(outcome.discarded).toEqual([{ candidateId: 'c1', code: 'explanation-missing' }]);
  });

  it.each([
    'Matches the policy.',
    // Long enough to clear the length floor, and still says nothing an exact
    // list of stock phrases would have caught.
    'It is allowed by the policy.',
    'This word is clearly covered by the exception policy.',
  ])('refuses an explanation that only restates the verdict: %s', (explanationEn) => {
    const outcome = applyDecisions(CANDIDATES, [
      { candidateId: 'c1', decision: 'approved', explanationEn },
    ]);

    expect(outcome.approvals.size).toBe(0);
    expect(outcome.discarded).toEqual([{ candidateId: 'c1', code: 'explanation-vague' }]);
  });

  it.each([
    'The policy allows onomatopoeia in dialogue, and this is one.',
    'Place names are allowed, and 図書館 is a place.',
  ])('accepts an explanation that names something: %s', (explanationEn) => {
    const outcome = applyDecisions(CANDIDATES, [
      { candidateId: 'c1', decision: 'approved', explanationEn },
    ]);

    expect(outcome.approvals.size).toBe(1);
    expect(outcome.discarded).toEqual([]);
  });

  it('reports an explicit rejection apart from every other way of staying unknown', () => {
    const outcome = applyDecisions(CANDIDATES, [
      { candidateId: 'c1', decision: 'rejected', explanationEn: REASON },
    ]);

    // c2 was never answered for, so it is not settled and deserves another ask.
    expect(outcome.rejections).toEqual(['c1']);
    expect(outcome.stillUnknown).toEqual(['c1', 'c2']);
  });

  it('withdraws a rejection when the same candidate is decided twice', () => {
    const outcome = applyDecisions(CANDIDATES, [
      { candidateId: 'c1', decision: 'rejected', explanationEn: REASON },
      { candidateId: 'c1', decision: 'approved', explanationEn: REASON },
    ]);

    expect(outcome.rejections).toEqual([]);
  });

  it('stores the trimmed explanation, so the reader shows what was actually said', () => {
    const outcome = applyDecisions(CANDIDATES, [
      { candidateId: 'c2', decision: 'approved', explanationEn: `  ${REASON}  ` },
    ]);

    expect(outcome.approvals.get('c2')).toMatchObject({ explanationEn: REASON });
  });
});

describe('noApprovals', () => {
  it('keeps every candidate unknown, which is what a failed review means', () => {
    const outcome = noApprovals(CANDIDATES);

    expect(outcome.approvals.size).toBe(0);
    expect(outcome.stillUnknown).toEqual(['c1', 'c2']);
    // A failed review settles nothing, so nothing may be skipped next pass.
    expect(outcome.rejections).toEqual([]);
  });
});
