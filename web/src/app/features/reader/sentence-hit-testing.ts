/** A rectangle in viewport coordinates, as `getClientRects` reports one. */
export interface HitRect {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}

/** One sentence and the line boxes it occupies. */
export interface SentenceBox {
  readonly id: string;
  /** One rect per line the sentence wraps across. */
  readonly rects: readonly HitRect[];
}

export interface HitPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * Which sentence a press belongs to.
 *
 * The reader has no per-sentence control, so the press itself has to be
 * forgiving: the gaps between words, the punctuation, the leading between two
 * lines, and the empty run out to the end of a line all have to reach the
 * sentence a reader clearly meant. Hit-testing the DOM cannot do that, because
 * a press in the leading lands on the paragraph rather than on any sentence,
 * so the decision is made from the line boxes instead.
 *
 * Kept pure and geometric so the rule can be tested for a point in a gap, a
 * point past the end of a line, and a point between two lines — none of which
 * a rendered fixture reproduces reliably.
 */
export function sentenceAt(boxes: readonly SentenceBox[], point: HitPoint): string | null {
  let best: { id: string; vertical: number; horizontal: number } | null = null;

  for (const box of boxes) {
    for (const rect of box.rects) {
      const vertical = axisDistance(point.y, rect.top, rect.bottom);
      const horizontal = axisDistance(point.x, rect.left, rect.right);
      if (vertical === 0 && horizontal === 0) {
        return box.id;
      }
      // The line the press is on wins over a nearer point on another line: a
      // press in the run of space after 。 belongs to the sentence that ended
      // there, not to the one starting on the line below.
      if (best === null || isCloser({ vertical, horizontal }, best)) {
        best = { id: box.id, vertical, horizontal };
      }
    }
  }

  return best?.id ?? null;
}

function isCloser(
  candidate: { vertical: number; horizontal: number },
  best: { vertical: number; horizontal: number },
): boolean {
  if (candidate.vertical !== best.vertical) {
    return candidate.vertical < best.vertical;
  }
  return candidate.horizontal < best.horizontal;
}

/** How far a coordinate lies outside a span, or 0 when it is inside it. */
function axisDistance(value: number, start: number, end: number): number {
  if (value < start) {
    return start - value;
  }
  if (value > end) {
    return value - end;
  }
  return 0;
}

/**
 * Reads the line boxes of every sentence rendered inside a paragraph, cut back
 * to its glyphs.
 *
 * A sentence's inline padding reaches past its first and last glyph so its
 * tint is inset from the text, and an equal negative margin lays it over the
 * neighbouring sentence. Measured with the padding, two sentences on one line
 * would share that band and the earlier one would take a press on the later
 * one's first character. Without it, every point on a line belongs to the
 * sentence whose glyph is there.
 */
export function sentenceBoxesIn(paragraph: HTMLElement): readonly SentenceBox[] {
  const boxes: SentenceBox[] = [];
  for (const element of paragraph.querySelectorAll<HTMLElement>('[data-sentence-id]')) {
    const id = element.dataset['sentenceId'];
    if (id === undefined) {
      continue;
    }
    const style = getComputedStyle(element);
    const start = parseFloat(style.paddingLeft) || 0;
    const end = parseFloat(style.paddingRight) || 0;
    boxes.push({
      id,
      // Every line fragment carries the padding, because the box decoration
      // is cloned onto each one.
      rects: [...element.getClientRects()].map((rect) => insetInline(rect, start, end)),
    });
  }
  return boxes;
}

function insetInline(rect: HitRect, start: number, end: number): HitRect {
  const left = rect.left + start;
  const right = rect.right - end;
  if (left <= right) {
    return { top: rect.top, bottom: rect.bottom, left, right };
  }
  const middle = (rect.left + rect.right) / 2;
  return { top: rect.top, bottom: rect.bottom, left: middle, right: middle };
}
