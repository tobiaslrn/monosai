/** A library virtual item has a stable key for its measured slot. */
export interface VirtualListItem {
  readonly key: string;
}

export interface VirtualListRange {
  /** Inclusive start of the mounted item range. */
  readonly start: number;
  /** Exclusive end of the mounted item range. */
  readonly end: number;
  readonly topSpacer: number;
  readonly bottomSpacer: number;
  readonly totalHeight: number;
}

export interface VariableHeightVirtualListOptions<T extends VirtualListItem> {
  readonly estimateHeight: (item: T) => number;
  readonly overscanPx?: number;
  readonly loadMoreThresholdPx?: number;
}

const EMPTY_RANGE: VirtualListRange = {
  start: 0,
  end: 0,
  topSpacer: 0,
  bottomSpacer: 0,
  totalHeight: 0,
};

/**
 * Pure layout state for a window-scrolled variable-height list.
 *
 * The model knows nothing about the DOM. The component supplies measured slot
 * heights as rows wrap, while this class keeps offsets and range calculation
 * deterministic and cheap to test.
 */
export class VariableHeightVirtualListModel<T extends VirtualListItem> {
  private readonly estimateHeight: (item: T) => number;
  private readonly overscanPx: number;
  private readonly loadMoreThresholdPx: number;
  private itemsValue: readonly T[] = [];
  private heights = new Map<string, number>();
  private indexes = new Map<string, number>();
  private offsets: readonly number[] = [0];

  constructor(options: VariableHeightVirtualListOptions<T>) {
    this.estimateHeight = options.estimateHeight;
    this.overscanPx = Math.max(0, options.overscanPx ?? 0);
    this.loadMoreThresholdPx = Math.max(0, options.loadMoreThresholdPx ?? 0);
  }

  get items(): readonly T[] {
    return this.itemsValue;
  }

  get totalHeight(): number {
    return this.offsets.at(-1) ?? 0;
  }

  /** Replaces the collection and intentionally discards every measurement. */
  reset(items: readonly T[]): void {
    this.heights.clear();
    this.setItemsInternal(items);
  }

  /** Appends or removes items while retaining measurements for stable keys. */
  setItems(items: readonly T[]): void {
    const keys = new Set(items.map((item) => item.key));
    for (const key of this.heights.keys()) {
      if (!keys.has(key)) {
        this.heights.delete(key);
      }
    }
    this.setItemsInternal(items);
  }

  /** Records a positive DOM measurement and returns whether layout changed. */
  updateMeasurement(key: string, height: number): boolean {
    if (!this.indexes.has(key) || !Number.isFinite(height) || height <= 0) {
      return false;
    }
    const nextHeight = Math.max(1, height);
    if (this.heights.get(key) === nextHeight) {
      return false;
    }
    this.heights.set(key, nextHeight);
    this.rebuildOffsets();
    return true;
  }

  heightOf(key: string): number | null {
    const index = this.indexes.get(key);
    return index === undefined ? null : this.itemHeight(index);
  }

  offsetOf(index: number): number {
    if (this.itemsValue.length === 0) {
      return 0;
    }
    const clamped = Math.min(Math.max(0, index), this.itemsValue.length);
    return this.offsets[clamped] ?? this.totalHeight;
  }

  rangeFor(scrollTop: number, viewportHeight: number): VirtualListRange {
    const itemCount = this.itemsValue.length;
    if (itemCount === 0) {
      return EMPTY_RANGE;
    }

    const top = Math.max(0, scrollTop);
    const viewport = Math.max(0, viewportHeight);
    const startPosition = Math.max(0, top - this.overscanPx);
    const endPosition = Math.min(this.totalHeight, top + viewport + this.overscanPx);
    const start = this.firstItemEndingAfter(startPosition);
    let end = this.firstItemStartingAtOrAfter(endPosition);
    if (end <= start) {
      end = Math.min(itemCount, start + 1);
    }

    return {
      start,
      end,
      topSpacer: this.offsetOf(start),
      bottomSpacer: Math.max(0, this.totalHeight - this.offsetOf(end)),
      totalHeight: this.totalHeight,
    };
  }

  isNearEnd(scrollTop: number, viewportHeight: number): boolean {
    return (
      this.itemsValue.length > 0 &&
      Math.max(0, scrollTop) + Math.max(0, viewportHeight) + this.loadMoreThresholdPx >=
        this.totalHeight
    );
  }

  private setItemsInternal(items: readonly T[]): void {
    this.itemsValue = items;
    this.indexes = new Map(items.map((item, index) => [item.key, index]));
    this.rebuildOffsets();
  }

  private rebuildOffsets(): void {
    const nextOffsets = [0];
    for (let index = 0; index < this.itemsValue.length; index += 1) {
      const previousOffset = nextOffsets[nextOffsets.length - 1] ?? 0;
      nextOffsets.push(previousOffset + this.itemHeight(index));
    }
    this.offsets = nextOffsets;
  }

  private itemHeight(index: number): number {
    const item = this.itemsValue[index];
    return this.heights.get(item.key) ?? this.safeEstimate(item);
  }

  private safeEstimate(item: T): number {
    const estimate = this.estimateHeight(item);
    return Number.isFinite(estimate) && estimate > 0 ? estimate : 1;
  }

  /** Finds the first item whose bottom edge is below the requested position. */
  private firstItemEndingAfter(position: number): number {
    let low = 0;
    let high = this.itemsValue.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      const itemEnd = this.offsets[middle + 1] ?? this.totalHeight;
      if (itemEnd <= position) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    return Math.min(low, this.itemsValue.length - 1);
  }

  /** Finds the first item whose top edge is at or below the end position. */
  private firstItemStartingAtOrAfter(position: number): number {
    let low = 0;
    let high = this.itemsValue.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      const itemStart = this.offsets[middle] ?? this.totalHeight;
      if (itemStart < position) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    return low;
  }
}
