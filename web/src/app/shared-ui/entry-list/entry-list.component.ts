import { ChangeDetectionStrategy, Component, input, model, ViewEncapsulation } from '@angular/core';
import { IconComponent } from '../icon/icon.component';

/**
 * A long list of items read as a table: a name, a few short figures in
 * columns, and a detail each item opens into.
 *
 *   <mn-entry-list [columns]="['Word', 'Difficulty', 'Studied']" figureTracks="4.25rem 5.25rem">
 *     <ul>
 *       <li>
 *         <mn-entry [(open)]="expanded">
 *           <span mn-entry-title>猫</span>
 *           <span mn-entry-meta>cat</span>
 *           <mn-figure mn-entry-figure label="Difficulty">32%</mn-figure>
 *           <mn-figure mn-entry-figure label="First studied" tone="quiet">Today</mn-figure>
 *           <p mn-entry-lead>ねこ</p>
 *           <p>The detail, in paragraphs and a list of lines.</p>
 *         </mn-entry>
 *       </li>
 *     </ul>
 *   </mn-entry-list>
 *
 * The column heads and every item's figures share `figureTracks`, declared in
 * rem so they grow with the text, so each head sits over its column. Items lay
 * themselves out against the list, not the window: a list too narrow for the
 * columns, such as a phone at a large text size, drops the heads and lines the
 * figures up under the name, each with its own label.
 *
 * Styles reach projected content and are therefore global, rooted at the
 * element.
 */
@Component({
  selector: 'mn-entry-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: { '[style.--mn-entry-figures]': 'figureTracks()' },
  template: `
    <div class="mn-entry-list__columns" aria-hidden="true">
      @for (column of columns(); track column) {
        <span>{{ column }}</span>
      }
    </div>
    <ng-content />
  `,
  styles: `
    @use '../../../styles/motion' as motion;
    mn-entry-list {
      display: block;
      min-width: 0;
      container: mn-entry-list / inline-size;
    }

    mn-entry-list ul {
      display: grid;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    mn-entry-list li {
      min-width: 0;
    }

    mn-entry-list .mn-entry-list__columns {
      display: grid;
      grid-template-columns: minmax(0, 1fr) var(--mn-entry-figures) 1.25rem;
      gap: var(--space-3);
      padding: 0 var(--space-3) var(--space-2);
      border-block-end: 1px solid var(--border-subtle);
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    mn-entry {
      display: block;
      min-width: 0;
    }

    mn-entry > details {
      border-block-end: 1px solid var(--border-subtle);
    }

    mn-entry > details[open] {
      border-radius: var(--radius-card);
      border-block-end-color: transparent;
      background: var(--surface-sunken-faint);
    }

    mn-entry summary {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto 1.25rem;
      gap: var(--space-3);
      align-items: center;
      min-height: var(--row-min-height);
      padding: var(--space-2) var(--space-3);
      border-radius: var(--radius-card);
      list-style: none;
      cursor: pointer;
    }

    mn-entry summary::-webkit-details-marker {
      display: none;
    }

    :where(html[data-pointer='mouse']) mn-entry summary:where(:hover),
    mn-entry summary:where(:active) {
      background: var(--surface-sunken-hover);
    }

    mn-entry .mn-entry__name {
      display: grid;
      min-width: 0;
    }

    mn-entry .mn-entry__title {
      overflow-wrap: anywhere;
      font-size: var(--text-lg);
      font-weight: var(--weight-semibold);
    }

    mn-entry .mn-entry__meta {
      overflow-wrap: anywhere;
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    mn-entry .mn-entry__figures {
      display: grid;
      grid-template-columns: var(--mn-entry-figures);
      gap: var(--space-3);
      align-items: center;
      font-size: var(--text-sm);
      font-variant-numeric: tabular-nums;
    }

    mn-entry .mn-entry__chevron {
      color: var(--text-secondary);
      @include motion.turn;
    }

    mn-entry > details[open] .mn-entry__chevron {
      transform: rotate(-90deg);
    }

    mn-entry .mn-entry__body {
      display: grid;
      gap: var(--space-1);
      padding: 0 var(--space-3) var(--space-3);
    }

    mn-entry .mn-entry__body > :where(p) {
      margin: 0;
    }

    /* The detail's own heading line, such as a word's reading. */
    mn-entry .mn-entry__body > p[mn-entry-lead] {
      font-size: var(--text-lg);
    }

    /* A list in the detail is a column of lines, each with its leading icon. */
    mn-entry .mn-entry__body > ul {
      display: grid;
      gap: var(--space-1);
      margin: var(--space-2) 0 0;
      padding: 0;
      list-style: none;
    }

    mn-entry .mn-entry__body > ul > li {
      display: flex;
      gap: var(--space-2);
      align-items: center;
      min-height: var(--touch-target);
      overflow-wrap: anywhere;
    }

    mn-entry .mn-entry__body > ul > li > mn-icon {
      flex: none;
      color: var(--text-secondary);
    }

    /* The open row's tint darkens the page, so a link in it takes the darker green. */
    mn-entry .mn-entry__body :where(a) {
      color: var(--action-primary-text);
    }

    mn-figure.mn-figure--quiet {
      color: var(--text-secondary);
    }

    mn-figure.mn-figure--warning {
      color: var(--status-warning);
      font-weight: var(--weight-semibold);
    }

    mn-figure .mn-figure__label {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }

    @container mn-entry-list (max-width: 20rem) {
      mn-entry-list .mn-entry-list__columns {
        display: none;
      }

      mn-entry summary {
        grid-template-columns: minmax(0, 1fr) 1.25rem;
      }

      mn-entry .mn-entry__figures {
        display: flex;
        flex-wrap: wrap;
        grid-column: 1;
        gap: 0 var(--space-3);
      }

      mn-figure .mn-figure__label {
        position: static;
        width: auto;
        height: auto;
        overflow: visible;
        clip-path: none;
        color: var(--text-secondary);
        font-weight: var(--weight-regular);
      }

      mn-entry .mn-entry__chevron {
        grid-row: 1 / span 2;
        grid-column: 2;
      }
    }
  `,
})
export class EntryListComponent {
  /** The heads over the name and each figure, in order. */
  readonly columns = input.required<readonly string[]>();
  /** The widths of the figure columns, as `grid-template-columns` tracks. */
  readonly figureTracks = input.required<string>();
}

/** One item of an `mn-entry-list`: its summary row, and the detail it opens into. */
@Component({
  selector: 'mn-entry',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <details [attr.data-testid]="testId()" [open]="open()" (toggle)="onToggle($event)">
      <summary>
        <span class="mn-entry__name">
          <span class="mn-entry__title"><ng-content select="[mn-entry-title]" /></span>
          <span class="mn-entry__meta"><ng-content select="[mn-entry-meta]" /></span>
        </span>
        <span class="mn-entry__figures"><ng-content select="[mn-entry-figure]" /></span>
        <mn-icon class="mn-entry__chevron" name="chevron-right" />
      </summary>
      <div class="mn-entry__body"><ng-content /></div>
    </details>
  `,
})
export class EntryComponent {
  readonly open = model(false);
  /** For durable tests: on the `details`. */
  readonly testId = input<string | null>(null);

  protected onToggle(event: Event): void {
    const open = (event.target as HTMLDetailsElement).open;
    if (open !== this.open()) {
      this.open.set(open);
    }
  }
}

/**
 * One figure in an entry's columns. Its label is said to assistive technology
 * while the column head above says it visually, and is shown beside the value
 * once the columns are gone.
 */
@Component({
  selector: 'mn-figure',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.mn-figure--quiet]': "tone() === 'quiet'",
    '[class.mn-figure--warning]': "tone() === 'warning'",
  },
  template: `<span class="mn-figure__label">{{ label() }} </span><ng-content />`,
})
export class FigureComponent {
  readonly label = input.required<string>();
  readonly tone = input<'default' | 'quiet' | 'warning'>('default');
}
