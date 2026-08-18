import { describe, expect, it } from 'vitest';
import {
  extendWindow,
  MAXIMUM_MOUNTED_PARAGRAPHS,
  windowAround,
  windowContains,
  windowEnd,
  type ParagraphWindowState,
} from './paragraph-window';

describe('windowAround', () => {
  it('centres the window on the anchor', () => {
    expect(windowAround(10, 100, 3)).toEqual({ first: 7, count: 7 });
  });

  it('clamps at the start of the reading', () => {
    expect(windowAround(1, 100, 3)).toEqual({ first: 0, count: 5 });
  });

  it('clamps at the end of the reading', () => {
    expect(windowAround(99, 100, 3)).toEqual({ first: 96, count: 4 });
  });

  it('mounts the whole reading when it is shorter than the window', () => {
    expect(windowAround(0, 2, 3)).toEqual({ first: 0, count: 2 });
  });

  it('mounts nothing for an empty reading', () => {
    expect(windowAround(0, 0)).toEqual({ first: 0, count: 0 });
  });

  it('mounts far fewer paragraphs than a long reading has', () => {
    const window = windowAround(500, 2_000);
    expect(window.count).toBeLessThanOrEqual(MAXIMUM_MOUNTED_PARAGRAPHS);
    expect(window.count).toBeLessThan(2_000);
  });
});

describe('extendWindow', () => {
  const total = 100;

  it('grows forwards when the learner reaches the bottom edge', () => {
    const grown = extendWindow({ first: 0, count: 7 }, 'forward', total, 3);
    expect(grown).toEqual({ first: 0, count: 10 });
  });

  it('grows backwards when the learner reaches the top edge', () => {
    const grown = extendWindow({ first: 10, count: 7 }, 'backward', total, 3);
    expect(grown).toEqual({ first: 7, count: 10 });
  });

  it('drops paragraphs from the far end once the bound is reached', () => {
    const grown = extendWindow({ first: 0, count: 15 }, 'forward', total, 3, 15);
    expect(grown.count).toBe(15);
    // The window moved rather than growing: the top three were unmounted.
    expect(grown.first).toBe(3);
    expect(windowEnd(grown)).toBe(18);
  });

  it('drops from the bottom when growing backwards past the bound', () => {
    const grown = extendWindow({ first: 20, count: 15 }, 'backward', total, 3, 15);
    expect(grown).toEqual({ first: 17, count: 15 });
  });

  it('never exceeds the mounted bound however far the learner scrolls', () => {
    let window: ParagraphWindowState = windowAround(0, 2_000);
    for (let step = 0; step < 200; step += 1) {
      window = extendWindow(window, 'forward', 2_000);
      expect(window.count).toBeLessThanOrEqual(MAXIMUM_MOUNTED_PARAGRAPHS);
    }
    expect(windowEnd(window)).toBeLessThanOrEqual(2_000);
  });

  it('returns the same state at the end of the reading, so no reload is issued', () => {
    const atEnd = { first: 95, count: 5 };
    expect(extendWindow(atEnd, 'forward', total)).toBe(atEnd);
  });

  it('returns the same state at the start of the reading', () => {
    const atStart = { first: 0, count: 5 };
    expect(extendWindow(atStart, 'backward', total)).toBe(atStart);
  });

  it('does nothing for an empty reading', () => {
    const empty = { first: 0, count: 0 };
    expect(extendWindow(empty, 'forward', 0)).toBe(empty);
  });
});

describe('windowContains', () => {
  it('covers the mounted range and excludes its exclusive end', () => {
    const window = { first: 5, count: 3 };
    expect(windowContains(window, 5)).toBe(true);
    expect(windowContains(window, 7)).toBe(true);
    expect(windowContains(window, 8)).toBe(false);
    expect(windowContains(window, 4)).toBe(false);
  });
});
