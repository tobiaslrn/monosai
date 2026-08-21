import type { PartOfSpeech, Token } from './token';
import type { TokenSpan, TokenStatusAssignment } from './validation';

/**
 * How the reader groups morphemes into the units a learner reads.
 *
 * The analyzer emits morphemes, not words: 飲み and ます are two tokens but one
 * verb, and が is a token of its own although it belongs to the noun in front of
 * it. Two levels are built from that stream, both presentation only — the
 * stored Japanese and the token stream are never rewritten:
 *
 * - a **word**, which is what gets looked up and inspected. あります is one word,
 *   and looking up its あり alone found 蟻, "ant".
 * - a **bunsetsu** (文節), which is what the spacing aid puts a gap between: a
 *   word plus the particles that mark it, the unit Japanese itself spaces on in
 *   children's books and textbooks.
 */

/** A word and the pieces the analyzer split it into. */
export interface WordGroup {
  readonly span: TokenSpan;
  readonly tokens: readonly Token[];
  /**
   * The token the word is about: its lemma and part of speech are the ones
   * worth looking up, whereas its inflection carries no dictionary entry.
   */
  readonly head: Token;
  /** The whole word as written, which is what the learner pressed. */
  readonly surface: string;
  /** Only when every part of the word has a reading. */
  readonly readingHiragana?: string;
}

/**
 * Morphemes that never open a word.
 *
 * Each completes the word in front of it rather than standing on its own: an
 * auxiliary carries tense or politeness, a suffix or counter finishes a stem.
 * Everything else — including a token the analyzer could not tag — opens a word,
 * because a mistagged content word standing alone is a smaller error than one
 * silently swallowed by its neighbour.
 */
const WORD_ATTACHING: ReadonlySet<PartOfSpeech> = new Set<PartOfSpeech>([
  'auxiliary',
  'suffix',
  'counter',
]);

/** Stems a helper verb can be joined to. */
const CONJUGABLE: ReadonlySet<PartOfSpeech> = new Set<PartOfSpeech>([
  'verb',
  'adjective-i',
  'auxiliary',
]);

/** The conjunctive particles that bind a helper verb to its stem. */
const CONNECTING_PARTICLES: ReadonlySet<string> = new Set(['て', 'で', 'ちゃ', 'じゃ']);

/**
 * Whether a particle is the seam inside a compound verb form.
 *
 * 〜ている is analyzed as 食べ + て + いる, so the て belongs to the word rather
 * than marking it. The test is deliberately narrow — a listed particle, between
 * a stem and a helper — so an ordinary particle is never swallowed.
 */
function connectsAHelperVerb(tokens: readonly Token[], index: number): boolean {
  const token = tokens[index];
  if (token.partOfSpeech !== 'particle' || !CONNECTING_PARTICLES.has(token.surface)) {
    return false;
  }
  const previous = tokens[index - 1].partOfSpeech;
  return (
    previous !== undefined &&
    CONJUGABLE.has(previous) &&
    tokens[index + 1]?.partOfSpeech === 'auxiliary'
  );
}

function opensAWord(tokens: readonly Token[], index: number): boolean {
  const token = tokens[index];
  const previous = tokens[index - 1];
  // A prefix opens a word and takes what it modifies with it: ご + 飯 is one
  // word, not two. Chains of prefixes fall out of the same rule.
  if (previous.partOfSpeech === 'prefix' && !token.isPunctuation) {
    return false;
  }
  if (token.isPunctuation || previous.isPunctuation) {
    return true;
  }
  if (connectsAHelperVerb(tokens, index)) {
    return false;
  }
  return token.partOfSpeech === undefined || !WORD_ATTACHING.has(token.partOfSpeech);
}

/** Marks, for each token, whether it opens a word. The first always does. */
export function wordStarts(tokens: readonly Token[]): readonly boolean[] {
  return tokens.map((_, index) => index === 0 || opensAWord(tokens, index));
}

function coveredByLaterPartOfSpan(spans: readonly TokenSpan[], index: number): boolean {
  return spans.some((span) => index > span.startTokenIndex && index <= span.endTokenIndex);
}

/**
 * Marks, for each token, whether it opens a bunsetsu.
 *
 * A word opens one unless it only marks the word before it: particles and
 * punctuation join the chunk they follow. `keepTogether` spans are never broken
 * into, because a reviewed multi-token phrase is one expression to the learner
 * whatever its morphemes are tagged as.
 */
export function bunsetsuStarts(
  tokens: readonly Token[],
  keepTogether: readonly TokenSpan[] = [],
): readonly boolean[] {
  const words = wordStarts(tokens);
  return tokens.map((token, index) => {
    if (index === 0) {
      return true;
    }
    if (!words[index] || coveredByLaterPartOfSpan(keepTogether, index)) {
      return false;
    }
    return !token.isPunctuation && token.partOfSpeech !== 'particle';
  });
}

/**
 * The word containing the token at `index`.
 *
 * Everything the reader shows and looks up for a press is taken from here, so a
 * press on any part of a word — its stem, its ending, its prefix — opens the
 * same word.
 */
export function wordAt(tokens: readonly Token[], index: number): WordGroup {
  const starts = wordStarts(tokens);
  let start = index;
  while (start > 0 && !starts[start]) {
    start -= 1;
  }
  let end = index;
  while (end + 1 < tokens.length && !starts[end + 1]) {
    end += 1;
  }

  const grouped = tokens.slice(start, end + 1);
  // A prefix carries no lemma or part of speech of its own, so the word is
  // about the first token that is not one.
  const head = grouped.find((token) => token.partOfSpeech !== 'prefix') ?? grouped[0];
  const readings = grouped.map((token) => token.readingHiragana);
  const complete = readings.every((reading) => reading !== undefined);

  return {
    span: { startTokenIndex: start, endTokenIndex: end },
    tokens: grouped,
    head,
    surface: grouped.map((token) => token.surface).join(''),
    ...(complete ? { readingHiragana: readings.join('') } : {}),
  };
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
