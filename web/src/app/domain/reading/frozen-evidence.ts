import { acceptsReadingMatch } from '../language/vocabulary-matcher';
import type { Token } from './token';
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
 *
 * Evidence is only as good as the matcher that produced it. A story accepted
 * when a word written in kanji, or a particle, could match a reviewed word by
 * its reading alone carries that match frozen; it no longer counts, so the
 * homophone is marked as the current snapshot says. `tokens` are the
 * sentence's tokens, which is how such a match is recognized.
 */
export function withFrozenEvidence(
  current: readonly TokenStatusAssignment[],
  frozen: readonly TokenStatusAssignment[],
  tokens: readonly Token[],
): readonly TokenStatusAssignment[] {
  if (frozen.length === 0) {
    return current;
  }
  const frozenByToken = new Map(frozen.map((status) => [status.tokenId, status]));
  const tokensById = new Map(tokens.map((token) => [token.id, token]));
  return current.map((status) => {
    if (!isUncovered(status.validation)) {
      return status;
    }
    const evidence = frozenByToken.get(status.tokenId);
    if (evidence === undefined || isUncovered(evidence.validation)) {
      return status;
    }
    return matchedByReadingItMayNotUse(evidence.validation, tokensById.get(status.tokenId))
      ? status
      : evidence;
  });
}

function matchedByReadingItMayNotUse(
  validation: TokenValidation,
  token: Token | undefined,
): boolean {
  return (
    validation.category === 'anki-normalized' &&
    validation.basis === 'reading' &&
    token !== undefined &&
    !acceptsReadingMatch(token)
  );
}
