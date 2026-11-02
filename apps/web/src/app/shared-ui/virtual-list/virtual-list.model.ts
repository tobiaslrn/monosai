/** A virtual item has a stable key for its measured slot. */
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

/** The range of a list with nothing in it, or not yet laid out. */
export const EMPTY_VIRTUAL_RANGE: VirtualListRange = {
  start: 0,
  end: 0,
  topSpacer: 0,
  bottomSpacer: 0,
  totalHeight: 0,
};

/**
 * Pure layout state for a window-scrolled variable-height list.
 *
 * The model knows nothing about the DOM. `VirtualListDirective` supplies
 * measured slot heights as rows wrap, while this class keeps offsets and range
 * calculation deterministic and cheap to test.
 */
export class VariableHeightVirtualListModel<T extends VirtualListItem> {
  private estimateHeight: (item: T) => number;
  private overscanPx = 0;
  private loadMoreThresholdPx = 0;
  private itemsValue: readonly T[] = [];
  private heights = new Map<string, number>();
  private indexes = new Map<string, number>();
  private offsets: readonly number[] = [0];

  constructor(options: VariableHeightVirtualListOptions<T>) {
    this.estimateHeight = options.estimateHeight;
    this.configure(options);
  }

  /**
   * Changes how unmeasured items are estimated and how far ranges reach,
   * keeping every measurement. Returns whether anything changed.
   */
  configure(options: VariableHeightVirtualListOptions<T>): boolean {
    const overscanPx = Math.max(0, options.overscanPx ?? 0);
    const loadMoreThresholdPx = Math.max(0, options.loadMoreThresholdPx ?? 0);
    if (
      options.estimateHeight === this.estimateHeight &&
      overscanPx === this.overscanPx &&
      loadMoreThresholdPx === this.loadMoreThresholdPx
    ) {
      return false;
    }
    this.estimateHeight = options.estimateHeight;
    this.overscanPx = overscanPx;
    this.loadMoreThresholdPx = loadMoreThresholdPx;
    this.rebuildOffsets();
    return true;
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
    const item = index === undefined ? undefined : this.itemsValue[index];
    return item === undefined ? null : this.itemHeight(item);
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
      return EMPTY_VIRTUAL_RANGE;
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
    let offset = 0;
    for (const item of this.itemsValue) {
      offset += this.itemHeight(item);
      nextOffsets.push(offset);
    }
    this.offsets = nextOffsets;
  }

  private itemHeight(item: T): number {
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
