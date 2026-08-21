import type { StructuralBaselineMatcher } from '../language/structural-baseline';
import { PART_OF_SPEECH_LABELS, type Token } from './token';
import type { WordGroup } from './token-grouping';

/**
 * How a word is put together, for a learner who can read its parts but not yet
 * see why they are stacked.
 *
 * 小さいです is an i-adjective followed by the polite copula, and 飲みます is a
 * verb stem followed by the polite ending. Both are already in the analysis and
 * in the shipped structural baseline; this only names them in order.
 */
export interface WordPart {
  readonly tokenId: string;
  readonly surface: string;
  /** What this piece is: a named form where one is known, else a word class. */
  readonly label: string;
  /** One line about what it does, when the baseline supplies one. */
  readonly detailEn: string | null;
}

function labelFor(token: Token): string {
  const partOfSpeech = token.partOfSpeech;
  return partOfSpeech === undefined ? 'Part of the word' : PART_OF_SPEECH_LABELS[partOfSpeech];
}

/**
 * The dictionary form of the piece that carries the meaning, when the page
 * shows an inflected spelling of it.
 */
function headDetail(token: Token): string | null {
  const lemma = token.lemma;
  return lemma === undefined || lemma === token.surface ? null : `Dictionary form ${lemma}`;
}

/**
 * Names each part of a word, head first.
 *
 * Empty for a word the analyzer did not split, where there is no composition to
 * show and the entry above already says everything: a single part listed under
 * its own heading is clutter, not an explanation.
 *
 * Endings are named from the structural baseline, which is curated and shipped
 * with the bundle, so nothing here is guessed and nothing costs a request. An
 * ending the baseline does not cover falls back to its word class, which is
 * still true.
 */
export function composeWord(
  word: WordGroup,
  baseline: StructuralBaselineMatcher | null,
): readonly WordPart[] {
  if (word.tokens.length < 2) {
    return [];
  }
  return word.tokens.map((token) => {
    const entry = token.id === word.head.id ? null : (baseline?.match(token) ?? null);
    return {
      tokenId: token.id,
      surface: token.surface,
      label: entry?.nameEn ?? labelFor(token),
      detailEn: entry?.descriptionEn ?? (token.id === word.head.id ? headDetail(token) : null),
    };
  });
}
