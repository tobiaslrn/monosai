import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { RouterLink } from '@angular/router';
import { VocabularyBrowseStore } from '../../application/vocabulary/vocabulary-browse.store';
import { formatCount, formatCountOf } from '../../domain/shared/locale';
import { DEFAULT_BROWSE_QUERY, type BrowseQuery } from '../../domain/vocabulary/vocabulary-browse';
import type { VocabularyEntry } from '../../domain/vocabulary/vocabulary-repository';
import { ButtonDirective } from '../../shared-ui/button/button';
import { openDialog } from '../../shared-ui/dialog/dialog';
import { EmptyStateComponent } from '../../shared-ui/empty-state/empty-state.component';
import { EntryListComponent } from '../../shared-ui/entry-list/entry-list.component';
import {
  MenuComponent,
  MenuItemDirective,
  MenuTriggerDirective,
} from '../../shared-ui/menu/menu.component';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import { ClusterComponent, PageComponent } from '../../shared-ui/layout/layout';
import { NoticeComponent } from '../../shared-ui/notice/notice.component';
import { SearchFieldComponent } from '../../shared-ui/search-field/search-field.component';
import { PageHeaderComponent } from '../../shared-ui/page-header/page-header.component';
import {
  VirtualItemDirective,
  VirtualListDirective,
} from '../../shared-ui/virtual-list/virtual-list.directive';
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
    RouterLink,
    ButtonDirective,
    ClusterComponent,
    EntryListComponent,
    EmptyStateComponent,
    IconComponent,
    NoticeComponent,
    PageComponent,
    PageHeaderComponent,
    SearchFieldComponent,
    MenuComponent,
    MenuItemDirective,
    MenuTriggerDirective,
    VirtualListDirective,
    VirtualItemDirective,
    VocabularyBrowseRowComponent,
  ],
  template: `
    <mn-page [gap]="3">
      <mn-page-header
        heading="Your vocabulary"
        backTo="/reading-level"
        backLabel="Back to what you can read"
      />

      <mn-cluster fill="first">
        <mn-search-field
          label="Search Japanese or English"
          placeholder="Search words"
          testId="vocabulary-search"
          [value]="store.query().search"
          (valueChange)="store.setSearch($event)"
        />
        <button
          mnButton
          type="button"
          aria-haspopup="dialog"
          (click)="openFilters()"
          data-testid="vocabulary-filters"
        >
          <mn-icon name="filter" />
          <span>Filters</span>
          @if (activeFilters(); as count) {
            <span class="mn-button__badge" aria-hidden="true">{{ count }}</span>
            <span class="mn-visually-hidden">, {{ count }} on</span>
          }
        </button>
      </mn-cluster>

      <mn-cluster justify="between">
        <p class="mn-hint" data-testid="vocabulary-count">{{ countLabel() }}</p>
        <button
          mnButton="ghost"
          type="button"
          edge="end"
          aria-haspopup="menu"
          data-testid="vocabulary-sort"
          [mnMenuTrigger]="sortMenu"
        >
          <span>{{ sortLabel() }}</span>
          <mn-icon name="chevron-up-down" />
        </button>
      </mn-cluster>
      <mn-menu #sortMenu="mnMenu" [menu]="true" aria-label="Sort by">
        @for (option of sortOptions; track option.value) {
          <button
            mnMenuItem
            type="button"
            [checked]="store.query().sort === option.value"
            (click)="setSort(option.value); sortMenu.hide()"
          >
            <span class="mn-dropdown-row__words">
              <span class="mn-dropdown-row__label">{{ option.label }}</span>
            </span>
            @if (store.query().sort === option.value) {
              <mn-icon class="mn-dropdown-row__check" name="check" tone="accent" />
            }
          </button>
        }
      </mn-menu>

      <p class="mn-visually-hidden" role="status" aria-live="polite">
        {{ matchAnnouncement() }}
      </p>

      @switch (store.state()) {
        @case ('loading') {
          <p class="mn-hint" role="status">Loading vocabulary…</p>
        }
        @case ('unavailable') {
          <mn-notice tone="error" role="alert">
            <p>Vocabulary is unavailable.</p>
            <button mn-notice-action mnButton type="button" (click)="reload()">Try again</button>
          </mn-notice>
        }
        @case ('failed') {
          <mn-notice tone="error" role="alert">
            <p>Vocabulary could not be loaded.</p>
            <button mn-notice-action mnButton type="button" (click)="reload()">Try again</button>
          </mn-notice>
        }
        @case ('empty') {
          <p class="mn-hint">
            {{
              store.snapshot() === null
                ? 'No words yet.'
                : 'Your word sources have no words in them.'
            }}
            <a routerLink="/reading-level" fragment="words">Add words</a>
          </p>
        }
        @case ('ready') {
          @if (store.matchCount() === 0) {
            <mn-empty-state
              icon="search"
              [heading]="
                store.query().search.trim() !== ''
                  ? 'No words match your search'
                  : 'No words match these filters'
              "
            >
              <button mnButton data-actions type="button" (click)="reset()">Reset filters</button>
            </mn-empty-state>
          } @else {
            <mn-entry-list
              [columns]="['Word', 'Difficulty', 'Studied']"
              figureTracks="4.25rem 5.25rem"
            >
              <h2 class="mn-visually-hidden">Words</h2>
              <div
                #list="virtualList"
                [mnVirtualList]="virtualEntries()"
                [estimateHeight]="estimateHeight"
                [overscanPx]="600"
              >
                <div
                  aria-hidden="true"
                  data-virtual-spacer="before"
                  [style.height.px]="list.range().topSpacer"
                ></div>
                <ul>
                  @for (item of list.visibleItems(); track item.key) {
                    <li [mnVirtualItem]="item.key">
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
                  aria-hidden="true"
                  data-virtual-spacer="after"
                  [style.height.px]="list.range().bottomSpacer"
                ></div>
              </div>
            </mn-entry-list>
          }
        }
      }
    </mn-page>
  `,
})
export class VocabularyBrowsePageComponent {
  protected readonly store = inject(VocabularyBrowseStore);
  private readonly dialog = inject(Dialog);

  protected readonly virtualEntries = computed<readonly VirtualVocabularyEntry[]>(() =>
    this.store.visible().map((entry) => ({ key: entry.itemId, entry })),
  );
  protected readonly estimateHeight = (): number => 82;
  /**
   * How many words there are, and how many a search or a filter leaves. A word
   * with two meanings is one word and two rows, so the matches are counted as
   * words too, and the line never mixes the two.
   */
  protected readonly countLabel = computed(() => {
    const snapshot = this.store.snapshot();
    const total = snapshot === null ? 0 : snapshot.uniqueEntryCount;
    if (this.store.state() !== 'ready' || this.store.matchCount() === this.store.entries().length) {
      return formatCountOf(total, 'word');
    }
    const matched = new Set(this.store.visible().map((entry) => entry.canonicalExpression)).size;
    return `${formatCount(matched)} of ${formatCountOf(total, 'word')}`;
  });
  protected readonly sortLabel = computed(
    () => SORT_OPTIONS.find((option) => option.value === this.store.query().sort)?.label ?? '',
  );
  /** How many of the Filters dialog's choices are narrowing the list. */
  protected readonly activeFilters = computed(() => {
    const query = this.store.query();
    return [
      query.sourceId !== DEFAULT_BROWSE_QUERY.sourceId,
      query.firstStudied !== DEFAULT_BROWSE_QUERY.firstStudied,
      query.difficulty.min !== DEFAULT_BROWSE_QUERY.difficulty.min ||
        query.difficulty.max !== DEFAULT_BROWSE_QUERY.difficulty.max,
    ].filter(Boolean).length;
  });
  protected readonly sortOptions = SORT_OPTIONS;
  protected readonly matchAnnouncement = computed(
    () =>
      `${formatCount(this.store.matchCount())} ${this.store.matchCount() === 1 ? 'word' : 'words'} shown.`,
  );

  constructor() {
    void this.store.load();
  }

  protected setSort(sort: BrowseQuery['sort']): void {
    this.store.applyQuery({ ...this.store.query(), sort });
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
    const ref = openDialog<
      BrowseQuery | undefined,
      VocabularyFilterSheetData,
      VocabularyFilterSheetComponent
    >(this.dialog, VocabularyFilterSheetComponent, {
      data,
      modal: true,
      labelledBy: 'vocabulary-filter-heading',
    });
    ref.closed.subscribe((query) => {
      if (query !== undefined) {
        this.store.applyQuery(query);
      }
    });
  }
}

/** The orders on offer, named as the sort button states the one in force. */
const SORT_OPTIONS: readonly { readonly value: BrowseQuery['sort']; readonly label: string }[] = [
  { value: 'first-studied-desc', label: 'Recently studied' },
  { value: 'first-studied-asc', label: 'First studied, oldest first' },
  { value: 'difficulty-desc', label: 'Difficulty, high to low' },
  { value: 'difficulty-asc', label: 'Difficulty, low to high' },
  { value: 'expression', label: 'By word' },
];
