/**
 * Endings the analyzer splits finer than they are ever taught.
 *
 * The derivation ladder is otherwise built entirely from analyzer output, one
 * step per ending. That is right almost everywhere, but IPADIC analyses
 * ませんでした as ます + ん + です + た, and walking those four in order asks the
 * learner to accept 行きませんです as a step along the way. It is not a form
 * anyone writes.
 *
 * So a short table names the runs that are one ending to a reader. Curation is
 * limited to naming: nothing here invents a form the analyzer did not find, and
 * a run that matches nothing still gets its generic step-by-step ladder.
 *
 * Longest match wins, so ませんでした is recognized before ません.
 */
export interface EndingCombination {
  /** Dictionary forms of the consecutive ending tokens this collapses. */
  readonly lemmas: readonly string[];
  /** The ending as it is written and taught. */
  readonly writtenForm: string;
  readonly effectEn: string;
  readonly detailEn: string;
}

export const ENDING_COMBINATIONS: readonly EndingCombination[] = [
  {
    lemmas: ['ます', 'ん', 'です', 'た'],
    writtenForm: 'ませんでした',
    effectEn: 'polite past negative',
    detailEn: 'The polite past negative. It is learned whole rather than assembled.',
  },
  {
    lemmas: ['ます', 'ん'],
    writtenForm: 'ません',
    effectEn: 'polite negative',
    detailEn: 'The polite negative, standing where ます would.',
  },
];

/**
 * The longest combination whose dictionary forms start at `lemmas`, if any.
 */
export function matchEndingCombination(lemmas: readonly string[]): EndingCombination | null {
  let longest: EndingCombination | null = null;
  for (const combination of ENDING_COMBINATIONS) {
    if (combination.lemmas.length > lemmas.length) {
      continue;
    }
    const matches = combination.lemmas.every((lemma, index) => lemma === lemmas[index]);
    if (matches && (longest === null || combination.lemmas.length > longest.lemmas.length)) {
      longest = combination;
    }
  }
  return longest;
}
