import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  Injector,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChildren,
} from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { createGlobalPositionStrategy } from '@angular/cdk/overlay';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { VocabularyBrowseStore } from '../../application/vocabulary/vocabulary-browse.store';
import { ViewportService } from '../../core/platform/viewport.service';
import { vocabularySourceId } from '../../domain/shared/ids';
import { formatCount, formatCountOf } from '../../domain/shared/locale';
import type { BrowseQuery } from '../../domain/vocabulary/vocabulary-browse';
import type { VocabularyEntry } from '../../domain/vocabulary/vocabulary-repository';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import type { IconName } from '../../shared-ui/icon/icon-set';
import { PageHeaderComponent } from '../../shared-ui/page-header/page-header.component';
import {
  VariableHeightVirtualListModel,
  type VirtualListRange,
} from '../library/library-virtual-list.model';
import { VocabularyBrowseRowComponent } from './vocabulary-browse-row.component';
import {
  VocabularyFilterSheetComponent,
  type VocabularyFilterSheetData,
} from './vocabulary-filter-sheet.component';

interface VirtualVocabularyEntry {
  readonly key: string;
  readonly entry: VocabularyEntry;
}

/** The searchable, filterable list of every stored vocabulary item. */
@Component({
  selector: 'mn-vocabulary-browse-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    RouterLink,
    IconComponent,
    PageHeaderComponent,
    VocabularyBrowseRowComponent,
  ],
  template: `
    <div class="mn-page mn-home-palette vocabulary-page">
      <mn-page-header
        heading="Your vocabulary"
        backTo="/reading-level"
        backLabel="Back to what you can read"
        [help]="true"
        [subtitle]="countLabel()"
      />

      <label class="search-field">
        <span class="mn-visually-hidden">Search vocabulary</span>
        <mn-icon class="search-icon" name="search" [size]="20" />
        <input
          class="mn-control"
          type="search"
          placeholder="Search Japanese or English"
          aria-label="Search Japanese or English"
          [ngModel]="store.query().search"
          (ngModelChange)="store.setSearch($event)"
          data-testid="vocabulary-search"
        />
      </label>

      <div class="toolbar">
        <label class="source-filter">
          <span class="mn-visually-hidden">Filter by source</span>
          <select
            class="mn-control source-select"
            aria-label="Filter by source"
            [ngModel]="store.query().sourceId ?? ''"
            (ngModelChange)="setSource($event)"
            data-testid="vocabulary-source-filter"
          >
            <option value="">All sources</option>
            @for (source of store.sources(); track source.sourceId) {
              <option [value]="source.sourceId">{{ source.label }}</option>
            }
          </select>
        </label>
        <button
          type="button"
          class="mn-button filters-button"
          aria-haspopup="dialog"
          (click)="openFilters()"
          data-testid="vocabulary-filters"
        >
          <mn-icon name="filter" [size]="18" /> Filters
        </button>
      </div>

      <p class="sort-line">
        {{ sortLabel() }}
        @if (sortIcon(); as icon) {
          <mn-icon [name]="icon" [size]="16" />
        }
      </p>

      <p class="mn-visually-hidden" role="status" aria-live="polite">
        {{ matchAnnouncement() }}
      </p>

      @switch (store.state()) {
        @case ('loading') {
          <p class="state-message" role="status">Loading vocabulary…</p>
        }
        @case ('unavailable') {
          <section class="state-message" role="alert">
            <p>Vocabulary is unavailable.</p>
            <button type="button" class="mn-button" (click)="reload()">Try again</button>
          </section>
        }
        @case ('failed') {
          <section class="state-message" role="alert">
            <p>Vocabulary could not be loaded.</p>
            <button type="button" class="mn-button" (click)="reload()">Try again</button>
          </section>
        }
        @case ('empty') {
          @if (store.snapshot() === null) {
            <p class="state-message">
              No vocabulary yet.
              <a routerLink="/reading-level" fragment="words">Add words</a>
            </p>
          } @else {
            <p class="state-message">
              No words yet.
              <a routerLink="/reading-level" fragment="words">Add words</a>
            </p>
          }
        }
        @case ('ready') {
          @if (store.matchCount() === 0) {
            <section class="state-message">
              <p>
                {{
                  store.query().search.trim() !== ''
                    ? 'No words match your search.'
                    : 'No words match these filters.'
                }}
              </p>
              <button type="button" class="reset" (click)="reset()">Reset filters</button>
            </section>
          } @else {
            <div class="list-region">
              <div class="columns" aria-hidden="true">
                <span>Word</span>
                <span>Difficulty</span>
                <span>Studied</span>
              </div>
              <div class="virtual-document">
                <div
                  class="virtual-spacer"
                  aria-hidden="true"
                  [style.height.px]="range().topSpacer"
                ></div>
                <ul class="entry-list">
                  @for (item of visibleItems(); track item.key) {
                    <li #virtualItem [attr.data-virtual-key]="item.key">
                      <mn-vocabulary-browse-row
                        [entry]="item.entry"
                        [sources]="store.sources()"
                        [expanded]="store.expandedId() === item.entry.itemId"
                        (expandedChange)="setExpanded(item.entry.itemId, $event)"
                      />
                    </li>
                  }
                </ul>
                <div
                  class="virtual-spacer"
                  aria-hidden="true"
                  [style.height.px]="range().bottomSpacer"
                ></div>
              </div>
            </div>
          }
        }
      }
    </div>
  `,
  styles: `
    /* The Library's rail, so the list reads as part of the same application. */
    .vocabulary-page {
      gap: var(--space-3);
      max-width: 42rem;
    }

    .search-field {
      position: relative;
      display: block;
      min-width: 0;
    }

    .search-icon {
      position: absolute;
      top: 50%;
      left: var(--space-3);
      color: var(--text-secondary);
      transform: translateY(-50%);
      pointer-events: none;
    }

    .search-field input {
      min-height: 3rem;
      padding-inline-start: 2.75rem;
    }

    /*
     * The picker and Filters share a line while the picker can keep a readable
     * width; with the text too large for that, Filters wraps below it rather
     * than the picker being squeezed until its value is cut off.
     */
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      align-items: center;
      justify-content: space-between;
    }

    .source-filter {
      flex: 1 1 9rem;
      min-width: 0;
      max-width: 16rem;
    }

    .source-select {
      width: 100%;
      border-radius: var(--radius-pill);
      font-weight: 500;
    }

    .filters-button {
      flex: none;
      border-color: var(--action-primary);
      border-radius: var(--radius-pill);
      color: var(--home-action-text);
      font-weight: 600;
    }

    .sort-line {
      display: flex;
      gap: var(--space-1);
      align-items: center;
      margin: var(--space-2) 0 0;
      font-size: var(--text-sm);
      font-weight: 500;
    }

    .state-message {
      margin: 0;
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    /* Rows lay themselves out against this box, not against the window. */
    .list-region {
      container: vocabulary-list / inline-size;
      min-width: 0;
    }

    /* The same tracks as a row's summary, so each label sits over its column. */
    .columns {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 4.25rem 5.25rem 1.25rem;
      gap: var(--space-3);
      padding: 0 var(--space-3) var(--space-2);
      border-block-end: 1px solid var(--border-subtle);
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    @container vocabulary-list (max-width: 20rem) {
      .columns {
        display: none;
      }
    }

    .virtual-document {
      width: 100%;
      min-width: 0;
    }

    .virtual-spacer {
      width: 100%;
      pointer-events: none;
    }

    .entry-list {
      display: grid;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .entry-list li {
      min-width: 0;
    }

    .state-message {
      display: grid;
      gap: var(--space-3);
      justify-items: start;
      padding-block: var(--space-5);
    }

    .state-message p {
      margin: 0;
    }

    .reset {
      min-height: var(--touch-target);
      padding: var(--space-2) 0;
      border: 0;
      background: transparent;
      color: var(--action-primary);
      text-decoration: underline;
      text-underline-offset: 3px;
      cursor: pointer;
    }
  `,
})
export class VocabularyBrowsePageComponent {
  protected readonly store = inject(VocabularyBrowseStore);
  private readonly dialog = inject(Dialog);
  private readonly injector = inject(Injector);
  private readonly viewport = inject(ViewportService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  private readonly model = new VariableHeightVirtualListModel<VirtualVocabularyEntry>({
    estimateHeight: () => 82,
    overscanPx: 600,
  });
  private readonly rangeSignal = signal<VirtualListRange>(this.model.rangeFor(0, 0));
  private readonly visibleItemsSignal = signal<readonly VirtualVocabularyEntry[]>([]);
  private readonly renderedItems = viewChildren<ElementRef<HTMLElement>>('virtualItem');
  private resizeObserver: ResizeObserver | null = null;

  protected readonly range = this.rangeSignal.asReadonly();
  protected readonly visibleItems = this.visibleItemsSignal.asReadonly();
  /**
   * How many words there are, and how many rows are showing once a search or a
   * filter has narrowed them. A word with two meanings is one word and two
   * rows, so the two are never written as "x of y".
   */
  protected readonly countLabel = computed(() => {
    const snapshot = this.store.snapshot();
    const total = snapshot === null ? '0 words' : formatCountOf(snapshot.uniqueEntryCount, 'word');
    if (this.store.state() !== 'ready' || this.store.matchCount() === this.store.entries().length) {
      return total;
    }
    return `${total} · ${formatCountOf(this.store.matchCount(), 'match', 'matches')}`;
  });
  protected readonly sortLabel = computed(() => sortLabel(this.store.query().sort));
  protected readonly sortIcon = computed(() => sortIcon(this.store.query().sort));
  protected readonly matchAnnouncement = computed(
    () =>
      `${formatCount(this.store.matchCount())} ${this.store.matchCount() === 1 ? 'word' : 'words'} shown.`,
  );

  constructor() {
    void this.store.load();
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver((entries) => {
        this.measureEntries(entries);
      });
    }

    effect(() => {
      const entries = this.store.visible();
      untracked(() => {
        this.model.setItems(entries.map((entry) => ({ key: entry.itemId, entry })));
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

    inject(DestroyRef).onDestroy(() => this.resizeObserver?.disconnect());
  }

  protected setSource(sourceId: string): void {
    this.store.setSource(sourceId === '' ? null : vocabularySourceId(sourceId));
  }

  protected setExpanded(id: VocabularyEntry['itemId'], expanded: boolean): void {
    this.store.setExpanded(expanded ? id : null);
  }

  protected reset(): void {
    this.store.reset();
  }

  protected reload(): void {
    void this.store.load();
  }

  protected openFilters(): void {
    const data: VocabularyFilterSheetData = {
      query: this.store.query(),
      entries: this.store.entries(),
      sources: this.store.sources(),
    };
    const positionStrategy = createGlobalPositionStrategy(this.injector);
    if (this.viewport.isMobile()) {
      positionStrategy.bottom('0').left('0');
    } else {
      positionStrategy.centerHorizontally().centerVertically();
    }
    const ref = this.dialog.open<BrowseQuery | undefined, VocabularyFilterSheetData>(
      VocabularyFilterSheetComponent,
      {
        data,
        panelClass: 'vocabulary-filter-pane',
        backdropClass: 'cdk-overlay-dark-backdrop',
        ariaLabelledBy: 'vocabulary-filter-heading',
        positionStrategy,
      },
    );
    ref.closed.subscribe((query) => {
      if (query !== undefined) {
        this.store.applyQuery(query);
      }
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

  private refreshRange(): void {
    if (typeof window === 'undefined') {
      return;
    }
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
  }

  private measureEntries(entries: readonly ResizeObserverEntry[]): void {
    let changed = false;
    for (const entry of entries) {
      const key = entry.target.getAttribute('data-virtual-key');
      if (key === null) {
        continue;
      }
      changed = this.model.updateMeasurement(key, entry.contentRect.height) || changed;
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

/** The current order, as one short line above the list. */
function sortLabel(sort: BrowseQuery['sort']): string {
  switch (sort) {
    case 'first-studied-desc':
      return 'Recently studied';
    case 'first-studied-asc':
      return 'First studied, oldest first';
    case 'difficulty-desc':
      return 'Difficulty, high to low';
    case 'difficulty-asc':
      return 'Difficulty, low to high';
    case 'expression':
      return 'By word';
  }
}

/** The direction glyph beside the sort line; an alphabetical order has none. */
function sortIcon(sort: BrowseQuery['sort']): IconName | null {
  switch (sort) {
    case 'first-studied-desc':
    case 'difficulty-desc':
      return 'sort-descending';
    case 'first-studied-asc':
    case 'difficulty-asc':
      return 'sort-ascending';
    case 'expression':
      return null;
  }
}
