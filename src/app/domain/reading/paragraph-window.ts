/**
 * Which paragraphs the reader keeps mounted.
 *
 * A 50,000-character import is thousands of paragraphs and tens of thousands of
 * token buttons. Mounting all of them would cost a long task on open and make
 * every aid toggle re-render the whole document, so the reader mounts a bounded
 * window around the reading position and moves it as the learner scrolls.
 */

/** Paragraphs kept on each side of the anchor when a window is first opened. */
export const WINDOW_RADIUS = 3;

/** Paragraphs added each time the learner scrolls past an edge. */
export const WINDOW_STEP = 3;

/**
 * Hard bound on mounted paragraphs. Reading straight through a long import
 * moves the window rather than growing it without limit.
 */
export const MAXIMUM_MOUNTED_PARAGRAPHS = 15;

export interface ParagraphWindowState {
  /** Position of the first mounted paragraph. */
  readonly first: number;
  readonly count: number;
}

export type WindowDirection = 'backward' | 'forward';

export function windowEnd(window: ParagraphWindowState): number {
  return window.first + window.count;
}

export function windowContains(window: ParagraphWindowState, position: number): boolean {
  return position >= window.first && position < windowEnd(window);
}

function clampWindow(first: number, last: number, total: number): ParagraphWindowState {
  const start = Math.max(0, Math.min(first, Math.max(0, total - 1)));
  const end = Math.min(total, Math.max(last, start + 1));
  return { first: start, count: Math.max(0, end - start) };
}

/** Opens a window centred on the anchor paragraph. */
export function windowAround(
  anchorPosition: number,
  totalParagraphs: number,
  radius = WINDOW_RADIUS,
): ParagraphWindowState {
  if (totalParagraphs <= 0) {
    return { first: 0, count: 0 };
  }
  const anchor = Math.max(0, Math.min(anchorPosition, totalParagraphs - 1));
  return clampWindow(anchor - radius, anchor + radius + 1, totalParagraphs);
}

/**
 * Grows the window towards an edge the learner reached, trimming the far side
 * once the window would exceed its bound. Returns the same state when there is
 * nothing further to mount, so callers can skip a redundant load.
 */
export function extendWindow(
  current: ParagraphWindowState,
  direction: WindowDirection,
  totalParagraphs: number,
  step = WINDOW_STEP,
  maximum = MAXIMUM_MOUNTED_PARAGRAPHS,
): ParagraphWindowState {
  if (totalParagraphs <= 0) {
    return current;
  }

  const grown =
    direction === 'forward'
      ? clampWindow(current.first, windowEnd(current) + step, totalParagraphs)
      : clampWindow(current.first - step, windowEnd(current), totalParagraphs);

  if (grown.first === current.first && grown.count === current.count) {
    return current;
  }

  if (grown.count <= maximum) {
    return grown;
  }

  return direction === 'forward'
    ? { first: windowEnd(grown) - maximum, count: maximum }
    : { first: grown.first, count: maximum };
}
