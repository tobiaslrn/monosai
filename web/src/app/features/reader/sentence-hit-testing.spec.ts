import { describe, expect, it } from 'vitest';
import { sentenceAt, sentenceBoxesIn, type SentenceBox } from './sentence-hit-testing';

/**
 * Two sentences flowing across two lines, as they would be laid out in one
 * paragraph: the first ends part-way along line 2, the second starts there.
 *
 *   line 1 (y 100–120): [ s1 ......................................... ]
 *   line 2 (y 140–160): [ s1 ...... ][ s2 ...... ]        (space to 400)
 */
const BOXES: readonly SentenceBox[] = [
  {
    id: 's1',
    rects: [
      { top: 100, bottom: 120, left: 0, right: 400 },
      { top: 140, bottom: 160, left: 0, right: 150 },
    ],
  },
  { id: 's2', rects: [{ top: 140, bottom: 160, left: 150, right: 260 }] },
];

describe('sentenceAt', () => {
  it('returns the sentence a press lands inside', () => {
    expect(sentenceAt(BOXES, { x: 200, y: 110 })).toBe('s1');
    expect(sentenceAt(BOXES, { x: 200, y: 150 })).toBe('s2');
  });

  it('resolves a press in the leading between two lines to the nearer line', () => {
    // The whole point of the geometric rule: this press hits the paragraph and
    // no sentence at all, and still has to select something sensible.
    expect(sentenceAt(BOXES, { x: 200, y: 125 })).toBe('s1');
    expect(sentenceAt(BOXES, { x: 200, y: 137 })).toBe('s2');
  });

  it('gives the run of space after a sentence to that sentence', () => {
    // A press past the last glyph on line 2 belongs to the sentence that ended
    // there, not to the longer one above it.
    expect(sentenceAt(BOXES, { x: 380, y: 150 })).toBe('s2');
  });

  it('prefers the line the press is on over a horizontally nearer one', () => {
    expect(sentenceAt(BOXES, { x: 0, y: 150 })).toBe('s1');
    expect(sentenceAt(BOXES, { x: 155, y: 105 })).toBe('s1');
  });

  it('resolves a press below the last line to the last line', () => {
    expect(sentenceAt(BOXES, { x: 100, y: 400 })).toBe('s1');
    expect(sentenceAt(BOXES, { x: 250, y: 400 })).toBe('s2');
  });

  it('has nothing to select in an empty paragraph', () => {
    expect(sentenceAt([], { x: 10, y: 10 })).toBeNull();
    expect(sentenceAt([{ id: 's1', rects: [] }], { x: 10, y: 10 })).toBeNull();
  });
});

describe('sentenceBoxesIn', () => {
  it('measures each sentence to its glyphs, so neighbours on a line do not share a band', () => {
    const paragraph = document.createElement('p');
    paragraph.innerHTML =
      '<span data-sentence-id="s1">猫だ。</span><span data-sentence-id="s2">「犬」</span>';
    const [first, second] = [...paragraph.querySelectorAll<HTMLElement>('span')];
    const lines: Record<string, DOMRect[]> = {
      s1: [new DOMRect(0, 100, 110, 20)],
      s2: [new DOMRect(90, 100, 110, 20), new DOMRect(0, 140, 50, 20)],
    };
    for (const sentence of [first!, second!]) {
      sentence.style.paddingLeft = '10px';
      sentence.style.paddingRight = '10px';
      sentence.getClientRects = () => lines[sentence.dataset['sentenceId']!] as never;
    }
    document.body.append(paragraph);

    const boxes = sentenceBoxesIn(paragraph);
    paragraph.remove();

    expect(boxes.map((box) => box.rects.map((rect) => [rect.left, rect.right]))).toEqual([
      [[10, 100]],
      [
        [100, 190],
        [10, 40],
      ],
    ]);
    expect(sentenceAt(boxes, { x: 97, y: 110 })).toBe('s1');
    expect(sentenceAt(boxes, { x: 103, y: 110 })).toBe('s2');
  });
});
