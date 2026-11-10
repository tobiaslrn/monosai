import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { RouterLink } from '@angular/router';
import { VocabularyBrowseStore } from '../../application/vocabulary/vocabulary-browse.store';
import { vocabularySourceId } from '../../domain/shared/ids';
import { formatCount, formatCountOf } from '../../domain/shared/locale';
import type { BrowseQuery } from '../../domain/vocabulary/vocabulary-browse';
import type { VocabularyEntry } from '../../domain/vocabulary/vocabulary-repository';
import { ButtonDirective } from '../../shared-ui/button/button';
import { openDialog } from '../../shared-ui/dialog/dialog';
import { EntryListComponent } from '../../shared-ui/entry-list/entry-list.component';
import {
  SelectComponent,
  type SelectOption,
  type SelectValue,
} from '../../shared-ui/select/select.component';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import { ClusterComponent, PageComponent, StackComponent } from '../../shared-ui/layout/layout';
import { NoticeComponent } from '../../shared-ui/notice/notice.component';
import { SearchFieldComponent } from '../../shared-ui/search-field/search-field.component';
import type { IconName } from '../../shared-ui/icon/icon-set';
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
    IconComponent,
    NoticeComponent,
    PageComponent,
    PageHeaderComponent,
    SearchFieldComponent,
    SelectComponent,
    StackComponent,
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
        [subtitle]="countLabel()"
      />

      <mn-search-field
        label="Search Japanese or English"
        testId="vocabulary-search"
        [value]="store.query().search"
        (valueChange)="store.setSearch($event)"
      />

      <mn-cluster justify="between">
        <mn-select
          label="Filter by source"
          testId="vocabulary-source-filter"
          [options]="sourceOptions()"
          [value]="store.query().sourceId ?? ''"
          (valueChange)="setSource($event)"
        />
        <button
          mnButton
          type="button"
          aria-haspopup="dialog"
          (click)="openFilters()"
          data-testid="vocabulary-filters"
        >
          <mn-icon name="filter" [size]="18" /> Filters
        </button>
      </mn-cluster>

      <mn-cluster [gap]="1" class="mn-hint">
        <span>{{ sortLabel() }}</span>
        @if (sortIcon(); as icon) {
          <mn-icon [name]="icon" [size]="16" />
        }
      </mn-cluster>

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
            <mn-stack align="start">
              <p class="mn-hint">
                {{
                  store.query().search.trim() !== ''
                    ? 'No words match your search.'
                    : 'No words match these filters.'
                }}
              </p>
              <button mnButton="ghost" type="button" (click)="reset()">Reset filters</button>
            </mn-stack>
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
  protected readonly sourceOptions = computed<readonly SelectOption<string>[]>(() => [
    { value: '', label: 'All sources' },
    ...this.store.sources().map((source) => ({ value: source.sourceId, label: source.label })),
  ]);
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
  }

  protected setSource(sourceId: SelectValue): void {
    this.store.setSource(sourceId === '' ? null : vocabularySourceId(String(sourceId)));
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
