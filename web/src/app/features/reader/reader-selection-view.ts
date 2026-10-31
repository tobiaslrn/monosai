import { findingsCoveringToken, sentenceWideFindings } from '../../domain/enrichment/finding-spans';
import { presentStatus } from '../../domain/reading/token-presentation';
import type { ReaderSentence } from '../../application/reading/reader.store';
import type { UnknownWord } from './sentence-popover.component';
import type { WordGrammarState } from './word-inspector.component';

type GrammarFindings = Parameters<typeof sentenceWideFindings>[0];
type CoveredToken = Parameters<typeof findingsCoveringToken>[1];

/**
 * The words in a sentence the learner's vocabulary does not cover — the same
 * ones the page underlines, said in words.
 *
 * De-duplicated by surface, because a sentence repeating a word it does not
 * know says nothing more the second time.
 */
export function unknownWordsIn(sentence: ReaderSentence | undefined): readonly UnknownWord[] {
  const statuses = sentence?.statuses;
  if (sentence === undefined || statuses === null || statuses === undefined) {
    return [];
  }
  const words: UnknownWord[] = [];
  const seen = new Set<string>();
  for (const token of sentence.tokens) {
    const status = statuses.get(token.id);
    if (status === undefined || seen.has(token.surface)) {
      continue;
    }
    const presentation = presentStatus(status.validation);
    if (presentation.marker === 'warning-vocabulary') {
      seen.add(token.surface);
      words.push({ surface: token.surface, label: presentation.label });
    }
  }
  return words;
}

/**
 * The grammar around one word.
 *
 * Findings are filtered to the ones whose span covers this word, so a note
 * about a pattern elsewhere in the sentence is not attached to a word it says
 * nothing about.
 */
export function wordGrammarFor(
  token: CoveredToken,
  aids: {
    readonly grammar: { readonly findings: GrammarFindings } | null;
    readonly grammarStale: boolean;
  },
): WordGrammarState {
  const grammar = aids.grammar;
  return {
    findings: grammar === null ? [] : findingsCoveringToken(grammar.findings, token),
    sentenceFindings: grammar === null ? [] : sentenceWideFindings(grammar.findings),
    analyzed: grammar !== null,
    stale: aids.grammarStale,
  };
}
