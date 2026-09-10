import type { TokenStatusAssignment, TokenValidation } from './validation';

/**
 * Whether a status says the word is not covered.
 *
 * Decided by category rather than by presentation, so the rule does not move
 * when the reader's copy or markers do.
 */
function isUncovered(validation: TokenValidation): boolean {
  switch (validation.category) {
    case 'not-in-snapshot':
    case 'unknown':
      return true;
    case 'punctuation':
    case 'anki-exact':
    case 'anki-normalized':
    case 'anki-phrase':
    case 'structural-baseline':
    case 'entity':
    case 'policy-exception':
      return false;
  }
}

/**
 * Backs a generated story's current classification with the evidence it was
 * accepted on.
 *
 * A word is known when it matches the current snapshot or the story's frozen
 * evidence (glossary: Known), so a token is left uncovered only when both say
 * so. The current status wins whenever it covers the word, which lets a word
 * the learner has since reviewed stop being marked; the frozen status fills in
 * what the snapshot cannot express, above all a policy exception, which is by
 * definition not in Anki.
 */
export function withFrozenEvidence(
  current: readonly TokenStatusAssignment[],
  frozen: readonly TokenStatusAssignment[],
): readonly TokenStatusAssignment[] {
  if (frozen.length === 0) {
    return current;
  }
  const frozenByToken = new Map(frozen.map((status) => [status.tokenId, status]));
  return current.map((status) => {
    if (!isUncovered(status.validation)) {
      return status;
    }
    const evidence = frozenByToken.get(status.tokenId);
    return evidence === undefined || isUncovered(evidence.validation) ? status : evidence;
  });
}
