import type { FindingConfidence } from '../enrichment/records';
import type { SentenceId } from '../shared/ids';

/** Keeps input and the at-most-three findings per sentence inside a bounded reply. */
export const MAX_GRAMMAR_REVIEW_BATCH = 20;

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
