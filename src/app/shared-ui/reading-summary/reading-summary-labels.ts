import type { CompletionSummary, GrammarSummary } from '../../domain/reading/summaries';
import { isComplete } from '../../domain/reading/summaries';
import { formatCount, formatDate, formatRelativeDays } from '../../domain/shared/locale';

/**
 * Wording for a reading's denormalized summaries.
 *
 * Shared rather than owned by one screen: a library card, the saved panel after
 * a generation, and the reader's status panel all describe the same numbers,
 * and three tables that must agree is how they start to disagree. Pure
 * functions, so every branch can be asserted without rendering anything.
 */

export function completionLabel(name: string, summary: CompletionSummary): string {
  if (summary.completed === 0 && summary.failed === 0) {
    return `${name}: none yet`;
  }
  if (isComplete(summary)) {
    return `${name}: complete`;
  }
  return `${name}: ${formatCount(summary.completed)} of ${formatCount(summary.total)}`;
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

const DAY_MS = 86_400_000;

/**
 * When a reading was added, said the way a shelf says it.
 *
 * Rounded to whole days from local midnight, so something saved late last night
 * reads as "yesterday" rather than as a number of hours. A library card is not
 * a log: the exact timestamp told the learner nothing they could act on.
 */
export function relativeDay(timestamp: number, now: number): string {
  const startOfDay = (value: number): number => {
    const date = new Date(value);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  };
  const days = Math.round((startOfDay(timestamp) - startOfDay(now)) / DAY_MS);
  return days > -7 ? formatRelativeDays(days) : formatDate(timestamp);
}
