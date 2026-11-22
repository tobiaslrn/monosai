import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ButtonDirective } from '../../../shared-ui/button/button';
import { CardComponent } from '../../../shared-ui/card/card.component';
import {
  EntryComponent,
  EntryListComponent,
  FigureComponent,
} from '../../../shared-ui/entry-list/entry-list.component';
import { FactsComponent, type Fact } from '../../../shared-ui/facts/facts.component';
import { ShelfHeadingComponent } from '../../../shared-ui/group/shelf-heading.component';
import { IconComponent } from '../../../shared-ui/icon/icon.component';
import { PageComponent, StackComponent } from '../../../shared-ui/layout/layout';
import { ListRowComponent } from '../../../shared-ui/list-row/list-row.component';
import { NoticeComponent } from '../../../shared-ui/notice/notice.component';
import { PageHeaderComponent } from '../../../shared-ui/page-header/page-header.component';
import { PagingStatusComponent } from '../../../shared-ui/paging-status/paging-status.component';
import { RowComponent } from '../../../shared-ui/row/row.component';
import { SectionComponent } from '../../../shared-ui/section/section.component';

/** Rows that lead somewhere, shelves, cards, entries and facts. */
@Component({
  selector: 'mn-gallery-lists',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonDirective,
    CardComponent,
    EntryComponent,
    EntryListComponent,
    FactsComponent,
    FigureComponent,
    IconComponent,
    ListRowComponent,
    NoticeComponent,
    PageComponent,
    PageHeaderComponent,
    PagingStatusComponent,
    RowComponent,
    SectionComponent,
    ShelfHeadingComponent,
    StackComponent,
  ],
  template: `
    <mn-page>
      <mn-page-header heading="Lists and cards" backTo="/gallery" backLabel="Back to gallery" />

      <mn-section heading="Rows" [rows]="true">
        <mn-row link="/gallery" heading="Your words" icon="vocabulary">
          <span mn-row-meta>Which words Monosai writes from</span>
          <mn-icon name="chevron-right" />
        </mn-row>
        <mn-row heading="Choose this voice" [action]="true">
          <span mn-row-meta>Kore · calm and clear</span>
        </mn-row>
        <mn-row heading="Delete everything">
          <span mn-row-meta>Every story in this browser</span>
          <button mnButton="danger" type="button">Delete all</button>
        </mn-row>
        <mn-row heading="Package import" [disabled]="true" [action]="true">
          <span mn-row-meta>Needs a package</span>
        </mn-row>
      </mn-section>

      <mn-stack>
        <mn-row link="/gallery" heading="Writing a story" surface="card" icon="generate">
          <span mn-row-meta>Step 2 of 4</span>
          <mn-icon name="chevron-right" />
        </mn-row>
        <mn-row heading="Story set aside" surface="muted" icon="pause">
          <span mn-row-meta>Stopped after the plot</span>
        </mn-row>
      </mn-stack>

      <section aria-labelledby="mn-gallery-today">
        <mn-shelf-heading heading="Today" headingId="mn-gallery-today" [first]="true" />
        <mn-stack [gap]="2">
          <mn-list-row routerLink="/gallery">
            <span mn-list-row-leading class="mn-icon-badge" aria-hidden="true">
              <mn-icon name="generate" />
            </span>
            <span mn-list-row-title>A walk in the park</span>
            <span mn-list-row-excerpt>The rain stopped just before noon.</span>
            <span mn-list-row-meta>
              <span>420 characters</span>
              <span>Short story</span>
            </span>
            <span mn-list-row-trailing><span class="mn-status-pill">Unread</span></span>
            <span mn-list-row-menu>
              <button
                mnButton="icon"
                type="button"
                aria-label="Story actions"
                title="Story actions"
              >
                <mn-icon name="overflow" />
              </button>
            </span>
          </mn-list-row>
          <mn-list-row routerLink="/gallery">
            <span mn-list-row-leading class="mn-icon-badge" aria-hidden="true">
              <mn-icon name="file" />
            </span>
            <span mn-list-row-title>Notes from the market</span>
            <span mn-list-row-meta><span>1,280 characters</span></span>
          </mn-list-row>
        </mn-stack>
      </section>

      <mn-section heading="Earlier" [rows]="true">
        <mn-list-row routerLink="/gallery" [inCard]="true">
          <span mn-list-row-title>The lost umbrella</span>
          <span mn-list-row-meta><span>640 characters</span></span>
        </mn-list-row>
        <mn-list-row routerLink="/gallery" variant="flush" [mutedLeading]="true">
          <span mn-list-row-leading class="mn-icon-badge" aria-hidden="true">
            <mn-icon name="file" />
          </span>
          <span mn-list-row-title>A letter home</span>
          <span mn-list-row-meta><span>310 characters</span></span>
        </mn-list-row>
      </mn-section>

      <mn-card heading="Reading level" [level]="2">
        <button mn-card-action mnButton="ghost" type="button">Change</button>
        <mn-facts [facts]="facts" label="Reading level" />
      </mn-card>

      <mn-entry-list [columns]="['Word', 'Difficulty', 'Studied']" figureTracks="5.25rem 6.25rem">
        <ul>
          @for (entry of entries; track entry.word; let first = $first) {
            <li>
              <mn-entry [open]="first">
                <span mn-entry-title>{{ entry.word }}</span>
                <span mn-entry-meta>{{ entry.meaning }}</span>
                <mn-figure mn-entry-figure label="Difficulty">{{ entry.difficulty }}</mn-figure>
                <mn-figure mn-entry-figure label="Studied" tone="quiet">{{
                  entry.studied
                }}</mn-figure>
                <p>{{ entry.detail }}</p>
              </mn-entry>
            </li>
          }
        </ul>
      </mn-entry-list>

      <mn-paging-status [loading]="true" loadingLabel="Loading more stories…">
        <mn-notice tone="danger" role="alert">
          <p>More stories could not be loaded</p>
          <button mn-notice-action mnButton type="button">Try again</button>
        </mn-notice>
      </mn-paging-status>
    </mn-page>
  `,
})
export class GalleryListsComponent {
  protected readonly facts: readonly Fact[] = [
    { label: 'Level', value: 'Plain' },
    { label: 'Forms', value: '42 of 60' },
    { label: 'Changed', value: '3 days ago', link: { route: '/gallery' } },
  ];
  protected readonly entries = [
    {
      word: 'umbrella',
      meaning: 'something to keep the rain off',
      difficulty: '32%',
      studied: 'Today',
      detail: 'Seen in 3 stories.',
    },
    {
      word: 'market',
      meaning: 'a place to buy food',
      difficulty: '18%',
      studied: 'Last week',
      detail: 'Seen in 5 stories.',
    },
    {
      word: 'letter',
      meaning: 'a written message',
      difficulty: '54%',
      studied: 'Never',
      detail: 'Seen in 1 story.',
    },
  ] as const;
}
