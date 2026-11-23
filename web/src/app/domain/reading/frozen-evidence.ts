import { containsKanji, isKanaOnly } from '../language/kana';
import { isFunctionWord } from '../language/vocabulary-matcher';
import type { Token } from './token';
import type {
  FrozenSentenceValidation,
  TokenStatusAssignment,
  TokenValidation,
} from './validation';

/**
 * Validator versions whose evidence predates the matching rule (arc42 8.1) and
 * is held to it when read back. Evidence from a later version was judged by
 * the rule itself and stands as it is.
 */
const VALIDATORS_BEFORE_MATCHING_RULE: ReadonlySet<string> = new Set(['validator/1']);

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
 * Evidence is only as good as the matcher that produced it, and a story
 * accepted before the matching rule (arc42 8.1) may carry a match the rule
 * refuses: a function word matched by how it sounds (は as 歯), or a word
 * written in kanji matched by its reading to a word written with other kanji
 * (紙 as 神). The evidence names its words only by ids that each vocabulary
 * refresh replaces, so the spelling it was matched against is not known; a
 * match that could be either kind no longer counts. Where the word it named is
 * still reviewed, the current snapshot covers the token by the rule itself
 * (猫 for ねこ), so only the evidence of a word since dropped is lost.
 * `tokens` are the sentence's tokens, which is how such a match is recognized.
 * `frozen` is undefined for a sentence with no stored evidence.
 */
export function withFrozenEvidence(
  current: readonly TokenStatusAssignment[],
  frozen: Pick<FrozenSentenceValidation, 'validatorVersion' | 'tokenStatuses'> | undefined,
  tokens: readonly Token[],
): readonly TokenStatusAssignment[] {
  if (frozen === undefined || frozen.tokenStatuses.length === 0) {
    return current;
  }
  const rejudge = VALIDATORS_BEFORE_MATCHING_RULE.has(frozen.validatorVersion);
  const frozenByToken = new Map(frozen.tokenStatuses.map((status) => [status.tokenId, status]));
  const tokensById = new Map(tokens.map((token) => [token.id, token]));
  return current.map((status) => {
    if (!isUncovered(status.validation)) {
      return status;
    }
    const evidence = frozenByToken.get(status.tokenId);
    if (evidence === undefined || isUncovered(evidence.validation)) {
      return status;
    }
    return rejudge &&
      matchedByReadingItMayNotUse(evidence.validation, tokensById.get(status.tokenId))
      ? status
      : evidence;
  });
}

function matchedByReadingItMayNotUse(
  validation: TokenValidation,
  token: Token | undefined,
): boolean {
  if (validation.category !== 'anki-normalized' || token === undefined) {
    return false;
  }
  if (isFunctionWord(token)) {
    // Its written form may have met a reviewed word's reading, so even a match
    // recorded under the written form is not evidence for grammar.
    return true;
  }
  return containsKanji(token.surface) && matchedThroughKana(validation.basis, token);
}

/** Whether the key the basis names is a kana spelling, which a reading can be. */
function matchedThroughKana(basis: string, token: Token): boolean {
  switch (basis) {
    case 'reading':
      return true;
    case 'lemma':
      return token.lemma !== undefined && isKanaOnly(token.lemma.normalize('NFKC'));
    default:
      return false;
  }
}
