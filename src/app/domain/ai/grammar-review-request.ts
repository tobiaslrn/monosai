import type { FindingConfidence } from '../enrichment/records';
import type { SentenceId } from '../shared/ids';

export interface GrammarReviewRequest {
  readonly profileGuidance: string;
  readonly registerPreference: string;
  readonly sentences: readonly { readonly id: SentenceId; readonly textJa: string }[];
  readonly promptVersion: string;
}

/** One finding as the provider returns it, before normalization. */
export interface ReviewedFinding {
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
