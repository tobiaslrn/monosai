import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChildren,
} from '@angular/core';
import type { Reading } from '../../domain/reading/reading';
import type { LibraryDateGroup, LibraryDateGroupKey } from './library-date-groups';
import { ReadingCardComponent } from './reading-card.component';
import { LibraryStore } from '../../application/reading/library.store';
import {
  VariableHeightVirtualListModel,
  type VirtualListRange,
} from './library-virtual-list.model';

export const LIBRARY_VIRTUAL_OVERSCAN_PX = 600;
export const LIBRARY_LOAD_MORE_THRESHOLD_PX = 480;

export type LibraryVirtualItem =
  | {
      readonly kind: 'heading';
      readonly key: string;
      readonly groupKey: LibraryDateGroupKey;
      readonly label: string;
      readonly isFirst: boolean;
    }
  | {
      readonly kind: 'reading';
      readonly key: string;
      readonly groupKey: LibraryDateGroupKey;
      readonly groupLabel: string;
      readonly reading: Reading;
      readonly isLastInGroup: boolean;
      readonly positionInGroup: number;
      readonly groupSize: number;
    };

interface VisibleLibraryGroup {
  readonly key: LibraryDateGroupKey;
  readonly label: string;
  readonly headingKey: string;
  readonly headingId: string;
  readonly headingVisible: boolean;
  readonly firstHeading: boolean;
  readonly readings: readonly LibraryVirtualReading[];
}

type LibraryVirtualReading = Extract<LibraryVirtualItem, { readonly kind: 'reading' }>;

/** Flattens group headings and cards into stable slots for the virtualizer. */
export function flattenLibraryVirtualItems(
  groups: readonly LibraryDateGroup[],
  hasMore = false,
): readonly LibraryVirtualItem[] {
  return groups.flatMap((group, groupIndex) => [
    {
      kind: 'heading' as const,
      key: headingKey(group.key),
      groupKey: group.key,
      label: group.label,
      isFirst: groupIndex === 0,
    },
    ...group.readings.map((reading, readingIndex): LibraryVirtualItem => ({
      kind: 'reading',
      key: readingKey(reading.id),
      groupKey: group.key,
      groupLabel: group.label,
      reading,
      isLastInGroup: readingIndex === group.readings.length - 1,
      positionInGroup: readingIndex + 1,
      groupSize: hasMore && groupIndex === groups.length - 1 ? -1 : group.readings.length,
    })),
  ]);
}

function headingKey(groupKey: LibraryDateGroupKey): string {
  return `library-heading-${groupKey}`;
}

function readingKey(id: string): string {
  return `library-reading-${id}`;
}

/**
 * The saved-reading shelf with window-scroll virtualization.
 *
 * Headings and cards are flattened only for range calculation. Rendered cards
 * are put back into their date-group sections and native `ul`/`li` semantics,
 * so virtualization changes how much is mounted, not what a row means.
 */
@Component({
  selector: 'mn-library-virtual-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReadingCardComponent],
  template: `
    <div class="virtual-library">
      <div class="virtual-spacer" aria-hidden="true" [style.height.px]="range().topSpacer"></div>

      @for (group of visibleGroups(); track group.key) {
        <section class="date-group" [attr.aria-labelledby]="group.headingId">
          @if (group.headingVisible) {
            <div
              #virtualItem
              class="virtual-heading"
              [class.is-first]="group.firstHeading"
              [attr.data-virtual-key]="group.headingKey"
            >
              <h2 [id]="group.headingId" class="mn-group-title">{{ group.label }}</h2>
            </div>
          } @else {
            <h2 class="mn-visually-hidden" [id]="group.headingId">{{ group.label }}</h2>
          }

          <ul class="reading-list mn-list-group">
            @for (item of group.readings; track item.key) {
              <li
                #virtualItem
                [attr.data-virtual-key]="item.key"
                [attr.aria-posinset]="item.positionInGroup"
                [attr.aria-setsize]="item.groupSize"
              >
                @if (item.kind === 'reading') {
                  <mn-reading-card
                    [reading]="item.reading"
                    (deleteRequested)="deleteRequested.emit($event)"
                    (renameRequested)="renameRequested.emit($event)"
                  />
                }
              </li>
            }
          </ul>
        </section>
      }

      @if (store.loadingMore()) {
        <p class="load-status" role="status" aria-live="polite">
          <span class="loading-dot" aria-hidden="true"></span>
          Loading more stories…
        </p>
      }

      @if (store.loadMoreError(); as error) {
        <section class="load-error mn-notice mn-notice--error" role="alert">
          <div>
            <p>More stories could not be loaded.</p>
            <p>{{ error.message }}</p>
          </div>
          <button type="button" class="mn-button" (click)="retryLoadMore()">Try again</button>
        </section>
      }

      <div class="virtual-spacer" aria-hidden="true" [style.height.px]="range().bottomSpacer"></div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
    }

    .virtual-library {
      width: 100%;
      min-width: 0;
    }

    .virtual-spacer {
      width: 100%;
      pointer-events: none;
    }

    .date-group {
      width: 100%;
      min-width: 0;
    }

    .virtual-heading {
      padding-block: var(--space-5) var(--space-2);
    }

    .virtual-heading.is-first {
      padding-block-start: var(--space-2);
    }

    .reading-list {
      width: 100%;
    }

    .load-status {
      display: flex;
      gap: var(--space-2);
      align-items: center;
      justify-content: center;
      margin: var(--space-2) 0;
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    .loading-dot {
      width: 0.5rem;
      height: 0.5rem;
      border-radius: var(--radius-pill);
      background: var(--action-primary);
      animation: library-loading-pulse 900ms ease-in-out infinite alternate;
    }

    .load-error {
      margin: var(--space-2) 0;
    }

    @keyframes library-loading-pulse {
      from {
        opacity: 0.45;
      }
      to {
        opacity: 1;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .loading-dot {
        animation: none;
      }
    }
  `,
})
export class LibraryVirtualListComponent {
  protected readonly store = inject(LibraryStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly groups = input.required<readonly LibraryDateGroup[]>();
  readonly deleteRequested = output<Reading>();
  readonly renameRequested = output<Reading>();

  private readonly model = new VariableHeightVirtualListModel<LibraryVirtualItem>({
    estimateHeight: (item) => (item.kind === 'heading' ? 48 : 62),
    overscanPx: LIBRARY_VIRTUAL_OVERSCAN_PX,
    loadMoreThresholdPx: LIBRARY_LOAD_MORE_THRESHOLD_PX,
  });
  private readonly rangeSignal = signal<VirtualListRange>(this.model.rangeFor(0, 0));
  private readonly visibleItemsSignal = signal<readonly LibraryVirtualItem[]>([]);
  private readonly renderedItems = viewChildren<ElementRef<HTMLElement>>('virtualItem');
  private resizeObserver: ResizeObserver | null = null;
  private lastCollectionRevision: number | null = null;

  protected readonly range = this.rangeSignal.asReadonly();
  protected readonly visibleGroups = computed<readonly VisibleLibraryGroup[]>(() => {
    const groups = new Map<
      LibraryDateGroupKey,
      {
        label: string;
        headingKey: string;
        headingId: string;
        headingVisible: boolean;
        firstHeading: boolean;
        readings: LibraryVirtualReading[];
      }
    >();

    for (const item of this.visibleItemsSignal()) {
      const existing = groups.get(item.groupKey);
      if (item.kind === 'heading') {
        if (existing === undefined) {
          groups.set(item.groupKey, {
            label: item.label,
            headingKey: item.key,
            headingId: `library-group-${item.groupKey}`,
            headingVisible: true,
            firstHeading: item.isFirst,
            readings: [],
          });
        } else {
          existing.headingVisible = true;
          existing.firstHeading = item.isFirst;
        }
        continue;
      }

      if (existing === undefined) {
        groups.set(item.groupKey, {
          label: item.groupLabel,
          headingKey: headingKey(item.groupKey),
          headingId: `library-group-${item.groupKey}`,
          headingVisible: false,
          firstHeading: false,
          readings: [item],
        });
      } else {
        existing.readings.push(item);
      }
    }

    return [...groups].map(([key, group]) => ({
      key,
      label: group.label,
      headingKey: group.headingKey,
      headingId: group.headingId,
      headingVisible: group.headingVisible,
      firstHeading: group.firstHeading,
      readings: group.readings,
    }));
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver((entries) => {
        this.measureEntries(entries);
      });
    }

    effect(() => {
      const items = flattenLibraryVirtualItems(this.groups(), this.store.hasMore());
      const collectionRevision = this.store.collectionRevision();
      untracked(() => {
        if (
          this.lastCollectionRevision === null ||
          collectionRevision !== this.lastCollectionRevision
        ) {
          this.model.reset(items);
          this.lastCollectionRevision = collectionRevision;
        } else {
          this.model.setItems(items);
        }
        this.refreshRange();
      });
    });

    effect((onCleanup) => {
      const elements = this.renderedItems();
      this.resizeObserver?.disconnect();
      for (const element of elements) {
        this.resizeObserver?.observe(element.nativeElement);
      }

      if (typeof requestAnimationFrame === 'undefined') {
        this.measureElements(elements);
        return;
      }
      const frame = requestAnimationFrame(() => {
        this.measureElements(elements);
      });
      onCleanup(() => {
        cancelAnimationFrame(frame);
      });
    });

    destroyRef.onDestroy(() => {
      this.resizeObserver?.disconnect();
    });
  }

  @HostListener('window:scroll')
  protected onWindowScroll(): void {
    this.refreshRange();
  }

  @HostListener('window:resize')
  protected onWindowResize(): void {
    this.refreshRange();
  }

  protected retryLoadMore(): void {
    void this.store.retryLoadMore();
  }

  private refreshRange(): void {
    const documentTop = this.host.nativeElement.getBoundingClientRect().top + window.scrollY;
    const localScrollTop = Math.max(0, window.scrollY - documentTop);
    const localViewportBottom = Math.max(
      localScrollTop,
      window.scrollY + window.innerHeight - documentTop,
    );
    const viewportHeight = Math.max(0, localViewportBottom - localScrollTop);
    const nextRange = this.model.rangeFor(localScrollTop, viewportHeight);
    const nextItems = this.model.items.slice(nextRange.start, nextRange.end);

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
    // also drives the existing repository page cursor.
    const nearEnd = this.model.isNearEnd(localScrollTop, viewportHeight);
    if (
      nearEnd &&
      this.store.hasMore() &&
      !this.store.loadingMore() &&
      this.store.loadMoreError() === null
    ) {
      void this.store.loadMore();
    }
  }

  private measureEntries(entries: readonly ResizeObserverEntry[]): void {
    let changed = false;
    for (const entry of entries) {
      const element = entry.target;
      const key = element.getAttribute('data-virtual-key');
      if (key === null) {
        continue;
      }
      changed =
        this.model.updateMeasurement(key, element.getBoundingClientRect().height) || changed;
    }
    if (changed) {
      this.refreshRange();
    }
  }

  private measureElements(elements: readonly ElementRef<HTMLElement>[]): void {
    let changed = false;
    for (const element of elements) {
      const key = element.nativeElement.getAttribute('data-virtual-key');
      if (key === null) {
        continue;
      }
      changed =
        this.model.updateMeasurement(key, element.nativeElement.getBoundingClientRect().height) ||
        changed;
    }
    if (changed) {
      this.refreshRange();
    }
  }
}
