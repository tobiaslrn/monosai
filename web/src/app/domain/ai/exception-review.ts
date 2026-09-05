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
  /** Up to three distinct sentences/title occurrences, so the policy has context. */
  readonly contextsJa: readonly string[];
}

export interface ExceptionDecision {
  readonly candidateId: string;
  readonly decision: 'approved' | 'rejected';
  readonly explanationEn: string;
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
  /**
   * Candidates the policy explicitly refused, as opposed to ones that stayed
   * unknown because the review failed, skipped them, or answered unusably.
   *
   * Only an explicit refusal is a settled answer: the same policy asked about
   * the same word will say the same thing, so a later pass in this run can skip
   * it. Everything else deserves another attempt.
   */
  readonly rejections: readonly string[];
  readonly discarded: readonly DiscardedDecision[];
}

/**
 * Shortest explanation that can carry a reason.
 *
 * The specification invalidates empty and vague explanations. A length floor
 * catches the empty half exactly; the vague half needs judgement. Both are
 * deliberately conservative: an invalid decision costs a repair attempt, never
 * an unearned approval.
 */
const MINIMUM_EXPLANATION_LENGTH = 12;

/** Words that can appear in a restatement of the verdict without adding to it. */
const VERDICT_WORDS: ReadonlySet<string> = new Set([
  'a',
  'allow',
  'allowed',
  'allows',
  'an',
  'and',
  'approve',
  'approved',
  'approves',
  'as',
  'because',
  'by',
  'clearly',
  'covered',
  'covers',
  'exception',
  'fine',
  'fits',
  'for',
  'in',
  'is',
  'it',
  'its',
  'matches',
  'of',
  'ok',
  'okay',
  'per',
  'permits',
  'permitted',
  'policy',
  'so',
  'the',
  'this',
  'to',
  'under',
  'word',
  'yes',
]);

/** How many words an explanation must add beyond restating the verdict. */
const MINIMUM_SUBSTANTIVE_WORDS = 2;

/**
 * Whether an explanation says nothing the verdict did not already say.
 *
 * An exact-match list of stock phrases was close to decorative: "it is allowed
 * by the policy" is long enough for the floor and is not on any such list. What
 * distinguishes a reason from a restatement is that a reason names something —
 * a clause of the policy, a property of the word — so the test is whether
 * anything is left once the words a bare verdict is made of are removed.
 */
function isVague(explanation: string): boolean {
  const words = explanation
    .toLowerCase()
    .split(/[^\p{Letter}\p{Number}'-]+/u)
    .filter((word) => word !== '');
  const substantive = words.filter((word) => !VERDICT_WORDS.has(word));
  return substantive.length < MINIMUM_SUBSTANTIVE_WORDS;
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
  const rejections = new Set<string>();
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
      rejections.delete(decision.candidateId);
      discarded.push({ candidateId: decision.candidateId, code: 'duplicate-candidate' });
      continue;
    }
    seen.add(decision.candidateId);

    if (decision.decision === 'rejected') {
      rejections.add(decision.candidateId);
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

  return { approvals, stillUnknown, rejections: [...rejections], discarded };
}

/** Every candidate stays unknown, which is what a failed review means. */
export function noApprovals(candidates: readonly ExceptionCandidate[]): ExceptionReviewOutcome {
  return {
    approvals: new Map<string, TokenValidation>(),
    stillUnknown: candidates.map((candidate) => candidate.id),
    rejections: [],
    discarded: [],
  };
}
