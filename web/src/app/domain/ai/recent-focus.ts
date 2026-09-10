/**
 * The newest words, in the order the learner met them.
 *
 * Recently learned is a list, not a weight (ADR 0067). A weight spread over
 * the whole snapshot left last week's words competing with hundreds of older
 * ones; a short ordered list says plainly which words are new and lets the
 * model favour the top of it. The whole snapshot remains the allowlist.
 */

/** One focus word as the prompt and provenance carry it. */
export interface FocusWord {
  readonly expression: string;
  /** A coarse English age such as "today" or "3 weeks ago". */
  readonly firstSeen: string;
}

/** What the selection needs to know about one deduplicated expression. */
export interface FocusCandidate {
  readonly expression: string;
  readonly firstReviewedAt?: number;
  readonly lastReviewedAt?: number;
}

const MILLISECONDS_PER_DAY = 86_400_000;

/**
 * Picks the `size` most recently first-reviewed expressions, newest first.
 *
 * A word without a first-review date is left out rather than guessed from its
 * interval: a guess would put a lapsed old word among the new ones. With no
 * dates at all the list is empty, and generation proceeds without a focus.
 *
 * AnkiDroid proves only the study day, so many words share one instant. The
 * latest answer breaks that tie, then the expression, so the order is stable.
 */
export function selectRecentFocus(
  candidates: readonly FocusCandidate[],
  size: number,
  now: number,
): readonly FocusWord[] {
  const wanted = Math.max(0, Math.trunc(size));
  return candidates
    .filter((candidate) => isTimestamp(candidate.firstReviewedAt))
    .sort(newestFirst)
    .slice(0, wanted)
    .map((candidate) => ({
      expression: candidate.expression,
      firstSeen: describeFirstSeen(candidate.firstReviewedAt ?? now, now),
    }));
}

/**
 * Names how long ago a word was first reviewed, in fixed steps.
 *
 * Calendar days in local time, so a word met late yesterday is "yesterday"
 * this morning. The steps are coarse on purpose: the model needs an order of
 * magnitude, and a coarse label keeps the prompt identical across a day.
 */
export function describeFirstSeen(firstReviewedAt: number, now: number): string {
  const days = Math.max(0, calendarDaysBetween(firstReviewedAt, now));
  if (days === 0) {
    return 'today';
  }
  if (days === 1) {
    return 'yesterday';
  }
  if (days <= 6) {
    return `${String(days)} days ago`;
  }
  if (days < 60) {
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? '1 week ago' : `${String(weeks)} weeks ago`;
  }
  return `${String(Math.floor(days / 30))} months ago`;
}

function newestFirst(left: FocusCandidate, right: FocusCandidate): number {
  return (
    compareDescending(left.firstReviewedAt, right.firstReviewedAt) ||
    compareDescending(left.lastReviewedAt, right.lastReviewedAt) ||
    (left.expression < right.expression ? -1 : left.expression > right.expression ? 1 : 0)
  );
}

/** Descending, with a missing value after every present one. */
function compareDescending(left: number | undefined, right: number | undefined): number {
  const a = isTimestamp(left) ? left : Number.NEGATIVE_INFINITY;
  const b = isTimestamp(right) ? right : Number.NEGATIVE_INFINITY;
  return a === b ? 0 : a > b ? -1 : 1;
}

function isTimestamp(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value);
}

/** Rounded, because a daylight-saving day is 23 or 25 hours long. */
function calendarDaysBetween(earlier: number, later: number): number {
  return Math.round((startOfLocalDay(later) - startOfLocalDay(earlier)) / MILLISECONDS_PER_DAY);
}

function startOfLocalDay(timestamp: number): number {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}
