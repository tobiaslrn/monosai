import type { PartOfSpeech } from '../reading/token';
import type { TokenValidation } from '../reading/validation';

/**
 * One candidate unknown put to the exception review.
 *
 * Candidates are unique by surface and lemma rather than per occurrence: the
 * policy is asked about a word, not about every place it appears, and asking
 * twice would let one word be approved in one sentence and refused in another.
 */
export interface ExceptionCandidate {
  readonly id: string;
  readonly surface: string;
  readonly lemma?: string;
  readonly readingHiragana?: string;
  readonly partOfSpeech?: PartOfSpeech;
  /** The sentence or title the word occurs in, so the policy has context. */
  readonly contextJa: string;
}

export interface ExceptionDecision {
  readonly candidateId: string;
  readonly decision: 'approved' | 'rejected';
  readonly explanationEn: string;
  readonly category?: string;
}

export type DecisionRejectionCode =
  'unknown-candidate' | 'duplicate-candidate' | 'explanation-missing' | 'explanation-vague';

export interface DiscardedDecision {
  readonly candidateId: string;
  readonly code: DecisionRejectionCode;
}

export interface ExceptionReviewOutcome {
  /** Approved candidates and the frozen status each one becomes. */
  readonly approvals: ReadonlyMap<string, TokenValidation>;
  /** Candidates that stay unknown: rejected, unreviewed, or invalidly decided. */
  readonly stillUnknown: readonly string[];
  readonly discarded: readonly DiscardedDecision[];
}

/**
 * Shortest explanation that can carry a reason.
 *
 * The specification invalidates empty and vague explanations. A length floor
 * catches the empty half exactly; the vague half needs judgement, so the check
 * below is a small list of answers that restate the verdict instead of giving a
 * reason. Both are deliberately conservative: an invalid decision costs a
 * repair attempt, never an unearned approval.
 */
const MINIMUM_EXPLANATION_LENGTH = 12;

const VERDICT_RESTATEMENTS: readonly string[] = [
  'ok',
  'okay',
  'yes',
  'fine',
  'allowed',
  'approved',
  'accepted',
  'policy',
  'per policy',
  'by policy',
  'it is allowed',
  'this is allowed',
  'matches the policy',
  'policy allows it',
];

function isVague(explanation: string): boolean {
  const normalized = explanation
    .trim()
    .toLowerCase()
    .replace(/[.!]+$/, '');
  return VERDICT_RESTATEMENTS.includes(normalized);
}

/**
 * Turns the review's answers into frozen validations.
 *
 * Every rule the specification states is enforced here rather than trusted from
 * the model: a decision must name a candidate that was actually sent, may name
 * it only once, and must give a real reason. Everything else — rejected,
 * unreviewed, invalidly decided — stays unknown and goes to repair, because the
 * one thing that must never happen is a word entering the library unvalidated
 * because a response was malformed in a convenient direction.
 *
 * An approval becomes `policy-exception`, never an `anki-*` category: the
 * learner has not reviewed the word, and the reader has to keep saying so.
 */
export function applyDecisions(
  candidates: readonly ExceptionCandidate[],
  decisions: readonly ExceptionDecision[],
): ExceptionReviewOutcome {
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const approvals = new Map<string, TokenValidation>();
  const discarded: DiscardedDecision[] = [];
  const seen = new Set<string>();

  for (const decision of decisions) {
    if (!byId.has(decision.candidateId)) {
      discarded.push({ candidateId: decision.candidateId, code: 'unknown-candidate' });
      continue;
    }
    if (seen.has(decision.candidateId)) {
      // A second answer for the same word means the review contradicted itself;
      // neither answer is trustworthy, so the first one is withdrawn too.
      approvals.delete(decision.candidateId);
      discarded.push({ candidateId: decision.candidateId, code: 'duplicate-candidate' });
      continue;
    }
    seen.add(decision.candidateId);

    if (decision.decision === 'rejected') {
      continue;
    }

    const explanation = decision.explanationEn.trim();
    if (explanation.length < MINIMUM_EXPLANATION_LENGTH) {
      discarded.push({ candidateId: decision.candidateId, code: 'explanation-missing' });
      continue;
    }
    if (isVague(explanation)) {
      discarded.push({ candidateId: decision.candidateId, code: 'explanation-vague' });
      continue;
    }

    approvals.set(decision.candidateId, {
      category: 'policy-exception',
      exceptionId: decision.candidateId,
      explanationEn: explanation,
    });
  }

  const stillUnknown = candidates
    .filter((candidate) => !approvals.has(candidate.id))
    .map((candidate) => candidate.id);

  return { approvals, stillUnknown, discarded };
}

/** Every candidate stays unknown, which is what a failed review means. */
export function noApprovals(candidates: readonly ExceptionCandidate[]): ExceptionReviewOutcome {
  return {
    approvals: new Map<string, TokenValidation>(),
    stillUnknown: candidates.map((candidate) => candidate.id),
    discarded: [],
  };
}
