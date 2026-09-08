import { describe, expect, it } from 'vitest';
import { VariableHeightVirtualListModel, type VirtualListItem } from './library-virtual-list.model';

interface TestItem extends VirtualListItem {
  readonly label: string;
}

function items(count: number): readonly TestItem[] {
  return Array.from({ length: count }, (_unused, index) => ({
    key: `item-${String(index)}`,
    label: `Item ${String(index)}`,
  }));
}

function model(options: Partial<{ overscanPx: number; loadMoreThresholdPx: number }> = {}) {
  return new VariableHeightVirtualListModel<TestItem>({
    estimateHeight: () => 100,
    overscanPx: options.overscanPx ?? 0,
    loadMoreThresholdPx: options.loadMoreThresholdPx ?? 0,
  });
}

describe('VariableHeightVirtualListModel', () => {
  it('calculates a viewport range with pixel overscan and spacers', () => {
    const virtualizer = model({ overscanPx: 50 });
    virtualizer.reset(items(10));

    expect(virtualizer.rangeFor(350, 100)).toEqual({
      start: 3,
      end: 5,
      topSpacer: 300,
      bottomSpacer: 500,
      totalHeight: 1_000,
    });
  });

  it('updates variable-height offsets when a wrapped row is measured', () => {
    const virtualizer = model();
    virtualizer.reset(items(4));

    expect(virtualizer.updateMeasurement('item-1', 180)).toBe(true);
    expect(virtualizer.totalHeight).toBe(480);
    expect(virtualizer.rangeFor(100, 100)).toEqual({
      start: 1,
      end: 2,
      topSpacer: 100,
      bottomSpacer: 200,
      totalHeight: 480,
    });
    expect(virtualizer.updateMeasurement('item-1', 180)).toBe(false);
  });

  it('removes measurements for items that leave the collection', () => {
    const virtualizer = model();
    virtualizer.reset(items(3));
    virtualizer.updateMeasurement('item-1', 180);

    const currentItems = items(3);
    virtualizer.setItems([currentItems[0], currentItems[2]]);

    expect(virtualizer.totalHeight).toBe(200);
    expect(virtualizer.heightOf('item-1')).toBeNull();
    expect(virtualizer.rangeFor(0, 500).end).toBe(2);
  });

  it('reports the loaded end only inside the configured trigger window', () => {
    const virtualizer = model({ loadMoreThresholdPx: 120 });
    virtualizer.reset(items(10));

    expect(virtualizer.isNearEnd(700, 100)).toBe(false);
    expect(virtualizer.isNearEnd(800, 100)).toBe(true);
  });
});
