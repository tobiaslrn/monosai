import type { FindingConfidence } from '../enrichment/records';
import type { SentenceId } from '../shared/ids';
import { estimateTokens, FIXED_PROMPT_OVERHEAD_TOKENS } from './context-budget';

/** A useful upper bound for one sparse grammar response. */
export const MAX_GRAMMAR_REVIEW_BATCH = 30;
/** Leaves ample room below the provider-agnostic request ceiling for model variance. */
export const GRAMMAR_REVIEW_INPUT_BUDGET_TOKENS = 12_000;
/** Grammar notes are intentionally selective: one useful construction, or none. */
export const MAX_GRAMMAR_FINDINGS_PER_SENTENCE = 1;

export interface GrammarReviewRequest {
  readonly profileGuidance: string;
  readonly registerPreference: string;
  readonly sentences: readonly { readonly id: SentenceId; readonly textJa: string }[];
  readonly promptVersion: string;
}

/**
 * One finding as the provider returns it, before normalization.
 *
 * The span arrives as text rather than as a pair of UTF-16 offsets. Counting
 * code units into Japanese is character-level arithmetic over text a model sees
 * as tokens, and it is bad at it; quoting a substring is something it is
 * reliable at. Monosai locates the quote itself, which is exact.
 */
export interface ReviewedFinding {
  readonly sentenceId: SentenceId;
  readonly label: string;
  readonly explanationEn: string;
  readonly confidence: FindingConfidence;
  readonly inProfile: boolean;
  /** The exact substring of that sentence the finding is about, when it is about one. */
  readonly spanJa?: string;
}

/** One finding after its span has been located, or downgraded to sentence-level. */
export interface NormalizedFinding {
  readonly sentenceId: SentenceId;
  readonly label: string;
  readonly explanationEn: string;
  readonly confidence: FindingConfidence;
  readonly inProfile: boolean;
  readonly startUtf16?: number;
  readonly endUtf16?: number;
}

export interface GrammarReviewResult {
  readonly findings: readonly ReviewedFinding[];
}

/**
 * Plans the largest contiguous grammar batches that remain cheap and bounded.
 *
 * The estimate deliberately includes the profile on every request because that
 * repeated prefix is real token spend. A single oversized sentence still gets
 * its own batch; the shared structured-request guard remains the final safety
 * boundary and can return a typed context error for it.
 */
export function planGrammarBatches<T extends { readonly id: SentenceId }>(
  sentences: readonly T[],
  profileGuidance: string,
  registerPreference: string,
  sentenceText: (sentence: T) => string,
): readonly (readonly T[])[] {
  const baseTokens =
    FIXED_PROMPT_OVERHEAD_TOKENS +
    estimateTokens(JSON.stringify({ guidance: profileGuidance, register: registerPreference }));
  const batches: T[][] = [];
  let current: T[] = [];
  let currentTokens = baseTokens;

  for (const sentence of sentences) {
    const sentenceTokens = estimateTokens(
      JSON.stringify({ id: sentence.id, textJa: sentenceText(sentence) }),
    );
    const exceedsCount = current.length >= MAX_GRAMMAR_REVIEW_BATCH;
    const exceedsBudget =
      current.length > 0 && currentTokens + sentenceTokens > GRAMMAR_REVIEW_INPUT_BUDGET_TOKENS;
    if (exceedsCount || exceedsBudget) {
      batches.push(current);
      current = [];
      currentTokens = baseTokens;
    }
    current.push(sentence);
    currentTokens += sentenceTokens;
  }
  if (current.length > 0) {
    batches.push(current);
  }
  return batches;
}
