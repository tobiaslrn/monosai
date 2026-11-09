import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  ViewEncapsulation,
} from '@angular/core';
import { RouterLink, type NavigationExtras, type UrlTree } from '@angular/router';
import { IconComponent } from '../icon/icon.component';
import type { IconName } from '../icon/icon-set';

/**
 * Where the row sits: `plain` inside a section's card of rows, which draws the
 * edges and hairlines; `card` on its own as a raised row; `muted` as a sunken
 * row for work still running or set aside.
 */
export type RowSurface = 'plain' | 'card' | 'muted';

let nextRowId = 0;

/**
 * One row: a leading mark, a title with one line of meta under it, an end
 * block opposite the title, and an optional menu. It is both a shelf row that
 * leads somewhere (`link`) and a settings row whose end holds a control or a
 * value.
 *
 *   <mn-row [link]="['/help', slug]" heading="Your words">
 *     <mn-icon mn-row-leading name="vocabulary" />
 *     <span mn-row-meta>Which words Monosai writes from</span>
 *     <mn-icon name="chevron-right" />                    ← the end block
 *   </mn-row>
 *
 *   <mn-row heading="Delete everything">
 *     <span mn-row-meta>Removes every reading from this browser.</span>
 *     <button mnButton="danger" type="button">Delete all</button>
 *   </mn-row>
 *
 * A row that does something here rather than leading away is an `action`: one
 * native button, pressed with `(pressed)`, such as a choice in a sheet.
 *
 * The end block is pinned to the inline end and centred on the title block.
 * When the row is too narrow for both, it moves below the title whole. A link
 * row is one native link named by its title and described by its meta; the
 * menu sits outside that link, so its button is never inside it.
 *
 * Styles reach projected content and are therefore global, rooted at the
 * element.
 */
@Component({
  selector: 'mn-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [NgTemplateOutlet, RouterLink, IconComponent],
  host: {
    '[class.mn-row--card]': "surface() === 'card'",
    '[class.mn-row--muted]': "surface() === 'muted'",
    '[class.mn-row--link]': 'link() !== null || action()',
  },
  template: `
    <ng-template #body>
      <span class="mn-row__leading">
        @if (icon(); as name) {
          <span class="mn-icon-badge" aria-hidden="true"
            ><mn-icon [name]="name" [size]="18"
          /></span>
        }
        <ng-content select="[mn-row-leading]" />
      </span>
      <span class="mn-row__text">
        <span class="mn-row__title" [id]="titleId">
          {{ heading() }}<ng-content select="[mn-row-title]" />
        </span>
        <span class="mn-row__meta" [id]="metaId"><ng-content select="[mn-row-meta]" /></span>
      </span>
      <span class="mn-row__end"><ng-content /></span>
    </ng-template>

    @if (link(); as target) {
      <a
        class="mn-row__main"
        [routerLink]="target"
        [fragment]="fragment()"
        [state]="state()"
        [attr.data-testid]="testId()"
        [attr.aria-labelledby]="titleId"
        [attr.aria-describedby]="metaId"
      >
        <ng-container [ngTemplateOutlet]="body" />
      </a>
    } @else if (action()) {
      <button
        type="button"
        class="mn-row__main"
        [disabled]="disabled()"
        [attr.data-testid]="testId()"
        [attr.aria-labelledby]="titleId"
        [attr.aria-describedby]="metaId"
        (click)="pressed.emit()"
      >
        <ng-container [ngTemplateOutlet]="body" />
      </button>
    } @else {
      <div class="mn-row__main" [attr.data-testid]="testId()">
        <ng-container [ngTemplateOutlet]="body" />
      </div>
    }
    <span class="mn-row__menu"><ng-content select="[mn-row-menu]" /></span>
  `,
  styles: `
    mn-row {
      display: flex;
      min-width: 0;
      min-height: var(--row-min-height);
      border-radius: var(--radius-card);
      color: var(--text-primary);
      container-type: inline-size;
    }

    mn-row.mn-row--card {
      border: 1px solid var(--border-subtle-faint);
      background: var(--surface-raised);
    }

    mn-row.mn-row--muted {
      background: var(--surface-sunken);
    }

    /* Hover is a mouse state, and only a destination or an action takes it (ADR 0082). */
    :where(html[data-pointer='mouse']) mn-row.mn-row--link:where(:hover):not(:has(> :disabled)) {
      background: var(--surface-sunken);
    }

    mn-row > .mn-row__main {
      display: flex;
      flex: 1 1 auto;
      gap: var(--space-2) min(var(--space-3), 12px);
      align-items: center;
      min-width: 0;
      padding: var(--row-inset-block) var(--surface-inset);
      border-radius: inherit;
      color: inherit;
      text-decoration: none;
    }

    mn-row > button.mn-row__main {
      width: 100%;
      border: 0;
      background: transparent;
      font: inherit;
      text-align: start;
      cursor: pointer;
    }

    mn-row > button.mn-row__main:disabled {
      cursor: default;
    }

    mn-row > :is(a, button).mn-row__main:focus-visible {
      outline: 3px solid var(--focus-ring);
      outline-offset: -3px;
    }

    mn-row .mn-row__leading {
      display: inline-flex;
      flex: none;
      align-items: center;
      justify-content: center;
      color: var(--text-secondary);
    }

    mn-row .mn-row__text {
      display: flex;
      flex: 1 1 12rem;
      flex-direction: column;
      gap: var(--line-gap);
      justify-content: center;
      min-width: 0;
    }

    /* A long title wraps once and then ends; the full title stays the link's name. */
    mn-row .mn-row__title {
      display: -webkit-box;
      overflow: hidden;
      overflow-wrap: anywhere;
      font-size: var(--text-md);
      font-weight: var(--weight-medium);
      line-height: var(--leading-snug);
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
    }

    mn-row.mn-row--link .mn-row__title {
      font-weight: var(--weight-semibold);
    }

    mn-row .mn-row__meta {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-1) var(--space-2);
      color: var(--text-secondary);
      font-size: var(--text-sm);
      line-height: var(--leading-snug);
      overflow-wrap: break-word;
    }

    mn-row .mn-row__end {
      display: flex;
      flex: 0 1 auto;
      flex-wrap: wrap;
      gap: var(--space-2);
      align-items: center;
      justify-content: flex-end;
      min-width: 0;
      max-width: 100%;
      margin-inline-start: auto;
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    mn-row .mn-row__menu {
      display: flex;
      flex: none;
      align-items: center;
    }

    mn-row :is(.mn-row__leading, .mn-row__meta, .mn-row__end, .mn-row__menu):empty {
      display: none;
    }

    /* Too narrow for both: the end block takes a line of its own, under the title. */
    @container (max-width: 22rem) {
      mn-row > .mn-row__main {
        flex-wrap: wrap;
      }

      mn-row:not(.mn-row--link) .mn-row__end {
        flex-basis: 100%;
        justify-content: flex-start;
        margin-inline-start: 0;
      }
    }

    @media (prefers-reduced-motion: no-preference) {
      mn-row.mn-row--link {
        transition: background-color var(--motion-fast) var(--ease-standard);
      }
    }
  `,
})
export class RowComponent {
  private readonly instance = nextRowId++;
  protected readonly titleId = `mn-row-${String(this.instance)}-title`;
  protected readonly metaId = `mn-row-${String(this.instance)}-meta`;

  /** The title as text; richer titles are projected with `mn-row-title`. */
  readonly heading = input<string>('');
  /** Where the row leads. A row without one is a settings row. */
  readonly link = input<readonly unknown[] | string | UrlTree | null>(null);
  readonly state = input<NavigationExtras['state']>(undefined);
  readonly fragment = input<string | undefined>(undefined);
  readonly surface = input<RowSurface>('plain');
  /** A meaningful origin or kind, drawn as the shared icon badge. */
  readonly icon = input<IconName | null>(null);
  /** The row is a button; `pressed` answers it. */
  readonly action = input(false);
  readonly disabled = input(false);
  readonly pressed = output<void>();
  /** For durable tests: on the link or button, or on the row's body when there is none. */
  readonly testId = input<string | null>(null);
}
