import {
  DestroyRef,
  Directive,
  ElementRef,
  contentChildren,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import {
  EMPTY_VIRTUAL_RANGE,
  VariableHeightVirtualListModel,
  type VirtualListItem,
  type VirtualListRange,
} from './virtual-list.model';

/** One measured slot of a virtual list, keyed like the item it renders. */
@Directive({
  selector: '[mnVirtualItem]',
  host: { '[attr.data-virtual-key]': 'key()' },
})
export class VirtualItemDirective {
  readonly key = input.required<string>({ alias: 'mnVirtualItem' });
  readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
}

/** Before any items have arrived, so the first set always starts fresh. */
const NO_GENERATION = Symbol('no generation');

/**
 * Window-scroll virtualization for a list of variable-height rows.
 *
 * Placed on the element the list renders in, which is what scroll offsets are
 * measured from. The host template renders `visibleItems()` between two spacers
 * sized from `range()`, and marks each rendered slot with `mnVirtualItem`; this
 * measures those slots as they mount and resize, and recomputes the range on
 * every window scroll and resize. The model it drives is pure and knows nothing
 * of the DOM.
 */
@Directive({
  selector: '[mnVirtualList]',
  exportAs: 'virtualList',
  host: {
    '(window:scroll)': 'refresh()',
    '(window:resize)': 'refresh()',
  },
})
export class VirtualListDirective<T extends VirtualListItem> {
  readonly items = input.required<readonly T[]>({ alias: 'mnVirtualList' });
  /** The height assumed for an item that has not been measured yet. */
  readonly estimateHeight = input.required<(item: T) => number>();
  /** How far beyond the viewport, in pixels, items stay mounted. */
  readonly overscanPx = input(0);
  /** How close to the end of the loaded items `nearEnd` starts to fire. */
  readonly loadMoreThresholdPx = input(0);
  /**
   * Which collection the items belong to. A new value discards every
   * measurement; otherwise items keep the measurements of their stable keys.
   */
  readonly generation = input<unknown>(undefined);
  /** The viewport has reached the end of the loaded items. */
  readonly nearEnd = output();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly slots = contentChildren(VirtualItemDirective, { descendants: true });
  private model: VariableHeightVirtualListModel<T> | null = null;
  private lastGeneration: unknown = NO_GENERATION;
  private readonly rangeSignal = signal<VirtualListRange>(EMPTY_VIRTUAL_RANGE);
  private readonly visibleItemsSignal = signal<readonly T[]>([]);

  /** What is mounted, and the space standing in for what is not. */
  readonly range = this.rangeSignal.asReadonly();
  readonly visibleItems = this.visibleItemsSignal.asReadonly();

  constructor() {
    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver((entries) => {
            this.measure(entries.map((entry) => entry.target));
          });

    effect(() => {
      const items = this.items();
      const generation = this.generation();
      const options = {
        estimateHeight: this.estimateHeight(),
        overscanPx: this.overscanPx(),
        loadMoreThresholdPx: this.loadMoreThresholdPx(),
      };
      untracked(() => {
        // Options can change like any binding; measurements survive it.
        const model = (this.model ??= new VariableHeightVirtualListModel<T>(options));
        model.configure(options);
        if (generation !== this.lastGeneration) {
          model.reset(items);
          this.lastGeneration = generation;
        } else {
          model.setItems(items);
        }
        this.refresh();
      });
    });

    effect((onCleanup) => {
      const elements = this.slots().map((slot) => slot.element);
      resizeObserver?.disconnect();
      for (const element of elements) {
        resizeObserver?.observe(element);
      }
      if (typeof requestAnimationFrame === 'undefined') {
        this.measure(elements);
        return;
      }
      const frame = requestAnimationFrame(() => {
        this.measure(elements);
      });
      onCleanup(() => {
        cancelAnimationFrame(frame);
      });
    });

    inject(DestroyRef).onDestroy(() => {
      resizeObserver?.disconnect();
    });
  }

  protected refresh(): void {
    const model = this.model;
    if (model === null) {
      return;
    }
    const documentTop = this.host.getBoundingClientRect().top + window.scrollY;
    const localScrollTop = Math.max(0, window.scrollY - documentTop);
    const localViewportBottom = Math.max(
      localScrollTop,
      window.scrollY + window.innerHeight - documentTop,
    );
    const viewportHeight = Math.max(0, localViewportBottom - localScrollTop);
    const nextRange = model.rangeFor(localScrollTop, viewportHeight);
    const nextItems = model.items.slice(nextRange.start, nextRange.end);

    const currentRange = this.rangeSignal();
    if (
      currentRange.start !== nextRange.start ||
      currentRange.end !== nextRange.end ||
      currentRange.topSpacer !== nextRange.topSpacer ||
      currentRange.bottomSpacer !== nextRange.bottomSpacer ||
      currentRange.totalHeight !== nextRange.totalHeight
    ) {
      this.rangeSignal.set(nextRange);
    }
    const currentItems = this.visibleItemsSignal();
    if (
      currentItems.length !== nextItems.length ||
      currentItems.some((item, index) => item !== nextItems[index])
    ) {
      this.visibleItemsSignal.set(nextItems);
    }

    // Loading is deliberately tied to the loaded virtual document, not to a
    // sentinel element. The same window scroll that drives mounting therefore
    // also drives whatever page cursor the list's owner keeps.
    if (model.isNearEnd(localScrollTop, viewportHeight)) {
      this.nearEnd.emit();
    }
  }

  private measure(elements: readonly Element[]): void {
    const model = this.model;
    if (model === null) {
      return;
    }
    let changed = false;
    for (const element of elements) {
      const key = element.getAttribute('data-virtual-key');
      if (key === null) {
        continue;
      }
      changed = model.updateMeasurement(key, element.getBoundingClientRect().height) || changed;
    }
    if (changed) {
      this.refresh();
    }
  }
}
