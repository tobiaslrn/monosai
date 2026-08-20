import type { CompletionSummary, GrammarSummary } from '../../domain/reading/summaries';
import { isComplete } from '../../domain/reading/summaries';

/**
 * Library-card wording for a reading's denormalized summaries.
 *
 * Pure functions rather than component methods so the card stays presentational
 * and every branch — including the ones a card only reaches after a partial
 * generation — can be asserted without rendering.
 */

export function completionLabel(name: string, summary: CompletionSummary): string {
  if (summary.completed === 0 && summary.failed === 0) {
    return `${name}: none yet`;
  }
  if (isComplete(summary)) {
    return `${name}: complete`;
  }
  return `${name}: ${String(summary.completed)} of ${String(summary.total)}`;
}

/**
 * Grammar review is advisory, so the wording never implies the Japanese is
 * wrong: `unavailable` says the review did not happen, not that it failed the
 * text, and a concern count is reported as notes rather than errors.
 */
export function grammarLabel(summary: GrammarSummary): string {
  switch (summary.state) {
    case 'not-requested':
      return 'Grammar: not reviewed';
    case 'unavailable':
      return 'Grammar: unavailable';
    case 'partial':
      return `Grammar: ${String(summary.analyzedSentenceCount)} reviewed, ${concerns(summary.concernCount)}`;
    case 'complete':
      return `Grammar: reviewed, ${concerns(summary.concernCount)}`;
  }
}

function concerns(count: number): string {
  if (count === 0) {
    return 'no notes';
  }
  return count === 1 ? '1 note' : `${String(count)} notes`;
}
