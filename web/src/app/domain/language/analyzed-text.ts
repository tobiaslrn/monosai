import type { Token } from '../reading/token';

/**
 * One analyzed sentence. `startUtf16`/`endUtf16` locate the sentence inside the
 * analyzed text; token offsets are relative to the sentence so a stored
 * `TokenAnalysis` stays valid on its own.
 */
export interface AnalyzedSentence {
  readonly startUtf16: number;
  readonly endUtf16: number;
  readonly text: string;
  readonly tokens: readonly Token[];
}

export interface AnalyzedText {
  readonly analyzerVersion: string;
  readonly segmentationRulesVersion: string;
  readonly sentences: readonly AnalyzedSentence[];
}

export interface AnalyzeTextRequest {
  /** Immutable source text. Never modified, only sliced. */
  readonly text: string;
  /**
   * `paragraph` segments the text into sentences first; `sentence` analyzes the
   * text as exactly one sentence, which is what stored sentences need.
   */
  readonly unit: 'paragraph' | 'sentence';
}

/**
 * Verifies that an analysis reproduces its source exactly.
 *
 * Every character of the sentence must be covered by a token or an explicit
 * unclassified span, and slices must be contiguous, so the reader can rebuild
 * the sentence from untouched source.
 */
export function tokensCoverSentence(sentence: AnalyzedSentence): boolean {
  let cursor = 0;
  for (const token of sentence.tokens) {
    if (token.startUtf16 !== cursor || token.endUtf16 <= token.startUtf16) {
      return false;
    }
    if (token.surface !== sentence.text.slice(token.startUtf16, token.endUtf16)) {
      return false;
    }
    cursor = token.endUtf16;
  }
  return cursor === sentence.text.length;
}
