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

/** Conservative first layout before any paragraph has been measured. */
export const DEFAULT_PARAGRAPH_HEIGHT_PX = 320;

export interface ParagraphWindowState {
  /** Position of the first mounted paragraph. */
  readonly first: number;
  readonly count: number;
}

export type WindowDirection = 'backward' | 'forward';

export interface ParagraphSpacers {
  readonly before: number;
  readonly after: number;
}

export function windowEnd(window: ParagraphWindowState): number {
  return window.first + window.count;
}

export function windowContains(window: ParagraphWindowState, position: number): boolean {
  return position >= window.first && position < windowEnd(window);
}

function paragraphHeight(
  position: number,
  estimatedHeight: number,
  measuredHeights: ReadonlyMap<number, number>,
): number {
  return measuredHeights.get(position) ?? estimatedHeight;
}

/** Space occupied by paragraphs outside the mounted range. */
export function paragraphSpacers(
  window: ParagraphWindowState,
  totalParagraphs: number,
  estimatedHeight = DEFAULT_PARAGRAPH_HEIGHT_PX,
  measuredHeights: ReadonlyMap<number, number> = new Map(),
): ParagraphSpacers {
  let before = 0;
  for (let position = 0; position < window.first; position += 1) {
    before += paragraphHeight(position, estimatedHeight, measuredHeights);
  }

  let after = 0;
  for (let position = windowEnd(window); position < totalParagraphs; position += 1) {
    after += paragraphHeight(position, estimatedHeight, measuredHeights);
  }
  return { before, after };
}

/** Paragraph represented by a vertical offset in the virtual document. */
export function paragraphAtOffset(
  offset: number,
  totalParagraphs: number,
  estimatedHeight = DEFAULT_PARAGRAPH_HEIGHT_PX,
  measuredHeights: ReadonlyMap<number, number> = new Map(),
): number {
  if (totalParagraphs <= 0) {
    return 0;
  }
  let remaining = Math.max(0, offset);
  for (let position = 0; position < totalParagraphs; position += 1) {
    const height = paragraphHeight(position, estimatedHeight, measuredHeights);
    if (remaining < height) {
      return position;
    }
    remaining -= height;
  }
  return totalParagraphs - 1;
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
