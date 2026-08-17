import { describe, expect, it } from 'vitest';
import { NAVIGATION_ITEMS, barItems, moreItems } from './navigation-items';

describe('navigation items', () => {
  it('splits destinations into the mobile bar and the More sheet', () => {
    const bar = barItems(NAVIGATION_ITEMS);
    const more = moreItems(NAVIGATION_ITEMS);

    expect(bar.length + more.length).toBe(NAVIGATION_ITEMS.length);
    expect(bar.every((item) => item.mobilePlacement === 'bar')).toBe(true);
    expect(more.every((item) => item.mobilePlacement === 'more')).toBe(true);
  });

  it('keeps the mobile bar within the four-item budget', () => {
    expect(barItems(NAVIGATION_ITEMS).length).toBeLessThanOrEqual(4);
  });

  it('registers unique absolute paths and labels', () => {
    const paths = NAVIGATION_ITEMS.map((item) => item.path);
    const labels = NAVIGATION_ITEMS.map((item) => item.label);

    expect(new Set(paths).size).toBe(paths.length);
    expect(new Set(labels).size).toBe(labels.length);
    expect(paths.every((path) => path.startsWith('/'))).toBe(true);
  });
});
