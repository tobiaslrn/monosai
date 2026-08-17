/** Completion of a per-sentence auxiliary aid for the current configuration. */
export interface CompletionSummary {
  readonly total: number;
  readonly completed: number;
  readonly failed: number;
}

export function emptyCompletion(total: number): CompletionSummary {
  return { total, completed: 0, failed: 0 };
}

export function isComplete(summary: CompletionSummary): boolean {
  return summary.total > 0 && summary.completed === summary.total;
}

/**
 * Advisory grammar state for a reading. Generated stories are reviewed
 * automatically; imported readings are analysed per sentence on request.
 */
export type GrammarSummary =
  | { readonly state: 'not-requested' }
  | {
      readonly state: 'partial';
      readonly analyzedSentenceCount: number;
      readonly concernCount: number;
    }
  | { readonly state: 'complete'; readonly concernCount: number }
  | { readonly state: 'unavailable'; readonly reasonCode: string };

export const NO_GRAMMAR_REVIEW: GrammarSummary = { state: 'not-requested' };
