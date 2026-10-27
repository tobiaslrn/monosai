import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import type { Reading } from '../../domain/reading/reading';
import type { LibraryDateGroup, LibraryDateGroupKey } from './library-date-groups';
import { ReadingCardComponent } from './reading-card.component';
import { LibraryStore } from '../../application/reading/library.store';
import {
  VirtualItemDirective,
  VirtualListDirective,
} from '../../shared-ui/virtual-list/virtual-list.directive';

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
  imports: [ReadingCardComponent, VirtualListDirective, VirtualItemDirective],
  template: `
    <div
      class="virtual-library"
      [mnVirtualList]="items()"
      [estimateHeight]="estimateHeight"
      [overscanPx]="overscanPx"
      [loadMoreThresholdPx]="loadMoreThresholdPx"
      [generation]="store.collectionRevision()"
      (nearEnd)="loadMore()"
    >
      <div
        class="virtual-spacer"
        aria-hidden="true"
        [style.height.px]="list().range().topSpacer"
      ></div>

      @for (group of visibleGroups(); track group.key) {
        <section class="date-group" [attr.aria-labelledby]="group.headingId">
          @if (group.headingVisible) {
            <div
              class="virtual-heading"
              [class.is-first]="group.firstHeading"
              [mnVirtualItem]="group.headingKey"
            >
              <h2 [id]="group.headingId" class="mn-group-title">{{ group.label }}</h2>
            </div>
          } @else {
            <h2 class="mn-visually-hidden" [id]="group.headingId">{{ group.label }}</h2>
          }

          <ul class="reading-list mn-list-group">
            @for (item of group.readings; track item.key) {
              <li
                [mnVirtualItem]="item.key"
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

      <div
        class="virtual-spacer"
        aria-hidden="true"
        [style.height.px]="list().range().bottomSpacer"
      ></div>
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
      animation: library-loading-pulse var(--motion-slow) var(--ease-ambient) infinite alternate;
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

  readonly groups = input.required<readonly LibraryDateGroup[]>();
  readonly deleteRequested = output<Reading>();
  readonly renameRequested = output<Reading>();

  protected readonly list =
    viewChild.required<VirtualListDirective<LibraryVirtualItem>>(VirtualListDirective);
  protected readonly items = computed(() =>
    flattenLibraryVirtualItems(this.groups(), this.store.hasMore()),
  );
  protected readonly estimateHeight = (item: LibraryVirtualItem): number =>
    item.kind === 'heading' ? 48 : 62;
  protected readonly overscanPx = LIBRARY_VIRTUAL_OVERSCAN_PX;
  protected readonly loadMoreThresholdPx = LIBRARY_LOAD_MORE_THRESHOLD_PX;

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

    for (const item of this.list().visibleItems()) {
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

  protected retryLoadMore(): void {
    void this.store.retryLoadMore();
  }

  /** The end of the loaded shelf is in view: the next repository page, once. */
  protected loadMore(): void {
    if (this.store.hasMore() && !this.store.loadingMore() && this.store.loadMoreError() === null) {
      void this.store.loadMore();
    }
  }
}
