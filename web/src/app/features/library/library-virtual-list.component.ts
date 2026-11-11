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
import { ButtonDirective } from '../../shared-ui/button/button';
import { ShelfHeadingComponent } from '../../shared-ui/group/shelf-heading.component';
import { NoticeComponent } from '../../shared-ui/notice/notice.component';
import { PagingStatusComponent } from '../../shared-ui/paging-status/paging-status.component';
import {
  VirtualItemDirective,
  VirtualListDirective,
} from '../../shared-ui/virtual-list/virtual-list.directive';

export const LIBRARY_VIRTUAL_OVERSCAN_PX = 600;
export const LIBRARY_LOAD_MORE_THRESHOLD_PX = 480;
/**
 * What a story row and a group heading measure, in pixels, before they are
 * measured for real: a title, its opening line and its facts with the hairline
 * above the row, and a heading with the gap above it. Both are the measured
 * height rounded up, never down: an unmeasured shelf that is shorter than the
 * real one cannot reach a saved scroll position, a taller one can.
 */
export const LIBRARY_ROW_ESTIMATE_PX = 85;
export const LIBRARY_HEADING_ESTIMATE_PX = 50;

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
  imports: [
    ButtonDirective,
    NoticeComponent,
    PagingStatusComponent,
    ReadingCardComponent,
    ShelfHeadingComponent,
    VirtualListDirective,
    VirtualItemDirective,
  ],
  template: `
    <div
      [mnVirtualList]="items()"
      [estimateHeight]="estimateHeight"
      [overscanPx]="overscanPx"
      [loadMoreThresholdPx]="loadMoreThresholdPx"
      [generation]="store.collectionRevision()"
      [seedHeights]="seedHeights()"
      (nearEnd)="loadMore()"
    >
      <div
        aria-hidden="true"
        data-virtual-spacer="before"
        [style.height.px]="list().range().topSpacer"
      ></div>

      @for (group of visibleGroups(); track group.key) {
        <section data-testid="date-group" [attr.aria-labelledby]="group.headingId">
          @if (group.headingVisible) {
            <mn-shelf-heading
              [heading]="group.label"
              [headingId]="group.headingId"
              [first]="group.firstHeading"
              [mnVirtualItem]="group.headingKey"
            />
          } @else {
            <h2 class="mn-visually-hidden" [id]="group.headingId">{{ group.label }}</h2>
          }

          <ul class="mn-list-group">
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

      @if (store.loadingMore() || store.loadMoreError() !== null) {
        <mn-paging-status [loading]="store.loadingMore()" loadingLabel="Loading more stories…">
          @if (store.loadMoreError(); as error) {
            <mn-notice tone="error" role="alert">
              <p>More stories could not be loaded.</p>
              <p>{{ error.message }}</p>
              <button mn-notice-action mnButton type="button" (click)="retryLoadMore()">
                Try again
              </button>
            </mn-notice>
          }
        </mn-paging-status>
      }

      <div
        aria-hidden="true"
        data-virtual-spacer="after"
        [style.height.px]="list().range().bottomSpacer"
      ></div>
    </div>
  `,
})
export class LibraryVirtualListComponent {
  protected readonly store = inject(LibraryStore);

  readonly groups = input.required<readonly LibraryDateGroup[]>();
  /** Heights measured on an earlier visit, so a returned-to shelf is as tall as it was. */
  readonly seedHeights = input<ReadonlyMap<string, number> | null>(null);
  readonly deleteRequested = output<Reading>();
  readonly renameRequested = output<Reading>();

  protected readonly list =
    viewChild.required<VirtualListDirective<LibraryVirtualItem>>(VirtualListDirective);
  protected readonly items = computed(() =>
    flattenLibraryVirtualItems(this.groups(), this.store.hasMore()),
  );
  protected readonly estimateHeight = (item: LibraryVirtualItem): number =>
    item.kind === 'heading' ? LIBRARY_HEADING_ESTIMATE_PX : LIBRARY_ROW_ESTIMATE_PX;
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

  /** What has been measured of the shelf so far. */
  measuredHeights(): ReadonlyMap<string, number> {
    return this.list().measuredHeights();
  }

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
