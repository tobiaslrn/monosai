import type { PartOfSpeech, Token } from './token';
import type { TokenSpan, TokenStatusAssignment } from './validation';

/**
 * Grouping of morphemes into bunsetsu (文節) for the reader's spacing aid.
 *
 * The analyzer emits morphemes, not words: 飲み and ます are two tokens but one
 * verb, and が is a token of its own although it belongs to the noun in front of
 * it. Spacing every token therefore printed analyzer internals — 目 が あり ます —
 * where a beginner needs the unit Japanese itself spaces on in children's books
 * and textbooks: a content word plus everything that clings to it.
 *
 * This is presentation only. Tokens stay the unit that is inspected, marked, and
 * read aloud; only the gaps between them move.
 */

/**
 * Morphemes that never open a bunsetsu.
 *
 * Each of these is grammatically bound to what precedes it: a particle marks the
 * word before it, an auxiliary carries that word's tense or politeness, and a
 * suffix or counter completes it. Everything else — including a token the
 * analyzer could not tag — opens one, because a mistagged content word split off
 * on its own is a smaller error than a whole clause silently glued to its
 * neighbour.
 */
const ATTACHING: ReadonlySet<PartOfSpeech> = new Set<PartOfSpeech>([
  'particle',
  'auxiliary',
  'suffix',
  'counter',
  'symbol',
]);

function attachesToPrevious(token: Token, previous: Token): boolean {
  // A prefix opens a bunsetsu and takes the word it modifies with it: ご + 飯 is
  // one chunk, not two. Chains of prefixes fall out of the same rule.
  if (previous.partOfSpeech === 'prefix') {
    return true;
  }
  if (token.isPunctuation) {
    return true;
  }
  return token.partOfSpeech !== undefined && ATTACHING.has(token.partOfSpeech);
}

function coveredByLaterPartOfSpan(spans: readonly TokenSpan[], index: number): boolean {
  return spans.some((span) => index > span.startTokenIndex && index <= span.endTokenIndex);
}

/**
 * Marks, for each token, whether it opens a new bunsetsu.
 *
 * The first token always opens one. `keepTogether` spans are never broken into:
 * a reviewed multi-token phrase is one expression to the learner regardless of
 * what its morphemes are tagged as.
 */
export function bunsetsuStarts(
  tokens: readonly Token[],
  keepTogether: readonly TokenSpan[] = [],
): readonly boolean[] {
  return tokens.map((token, index) => {
    if (index === 0) {
      return true;
    }
    if (coveredByLaterPartOfSpan(keepTogether, index)) {
      return false;
    }
    return !attachesToPrevious(token, tokens[index - 1]);
  });
}

/**
 * The reviewed-phrase spans among a sentence's statuses.
 *
 * Every token of a phrase carries the same span, so the spans are collected by
 * their start index rather than once per token.
 */
export function reviewedPhraseSpans(
  tokens: readonly Token[],
  statuses: ReadonlyMap<string, TokenStatusAssignment> | null,
): readonly TokenSpan[] {
  if (statuses === null) {
    return [];
  }
  const spans = new Map<number, TokenSpan>();
  for (const token of tokens) {
    const validation = statuses.get(token.id)?.validation;
    if (validation?.category === 'anki-phrase') {
      spans.set(validation.tokenSpan.startTokenIndex, validation.tokenSpan);
    }
  }
  return [...spans.values()];
}
