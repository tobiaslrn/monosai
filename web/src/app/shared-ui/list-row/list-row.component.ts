import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink, type NavigationExtras, type UrlTree } from '@angular/router';

export type ListRowVariant = 'card' | 'flush' | 'muted' | 'plain';

let nextListRowId = 0;

/**
 * The shared shape for a row that leads somewhere.
 *
 * The link owns the row's content. A menu is projected into a separate sibling
 * slot so an action button can never become invalid interactive content inside
 * the link. The marker attributes are deliberately light-weight projection API
 * rather than directives: callers keep ownership of the content they project.
 */
@Component({
  selector: 'mn-list-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div
      class="mn-list-row"
      [class.mn-list-row--flush]="variant() === 'flush'"
      [class.mn-list-row--muted]="variant() === 'muted'"
      [class.mn-list-row--plain]="variant() === 'plain'"
      [class.mn-list-row--muted-leading]="mutedLeading()"
    >
      <a
        class="mn-list-row__link"
        [routerLink]="routerLink()"
        [state]="state()"
        [attr.data-testid]="testId()"
        [attr.aria-labelledby]="titleId"
        [attr.aria-describedby]="metaId"
      >
        <span class="mn-list-row__leading">
          <ng-content select="[mn-list-row-leading]" />
        </span>
        <span class="mn-list-row__content">
          <span class="mn-list-row__title" [id]="titleId">
            <ng-content select="[mn-list-row-title]" />
          </span>
          <span class="mn-list-row__meta" [id]="metaId">
            <ng-content select="[mn-list-row-meta]" />
          </span>
        </span>
        <span class="mn-list-row__trailing">
          <ng-content select="[mn-list-row-trailing]" />
        </span>
      </a>
      <span class="mn-list-row__menu">
        <ng-content select="[mn-list-row-menu]" />
      </span>
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }

    .mn-list-row {
      display: flex;
      min-width: 0;
      min-height: 4.5rem;
      border: 1px solid color-mix(in srgb, var(--border-subtle) 35%, transparent);
      border-radius: var(--radius-card);
      background: var(--surface-raised);
      transition: background-color var(--motion-fast) ease-out;
    }

    .mn-list-row:hover {
      background: var(--surface-sunken);
    }

    .mn-list-row--flush,
    .mn-list-row--plain {
      border-color: transparent;
      background: transparent;
    }

    .mn-list-row--flush:hover,
    .mn-list-row--plain:hover {
      background: var(--surface-sunken);
    }

    .mn-list-row--muted {
      background: var(--surface-sunken);
    }

    .mn-list-row--muted:hover {
      background: color-mix(in srgb, var(--surface-sunken) 78%, var(--surface-raised));
    }

    .mn-list-row__link {
      display: flex;
      flex: 1 1 auto;
      gap: var(--space-3);
      align-items: center;
      min-width: 0;
      min-height: 4.5rem;
      padding: var(--space-2) var(--space-3);
      border-radius: inherit;
      color: var(--text-primary);
      text-decoration: none;
    }

    .mn-list-row__link:focus-visible {
      outline: none;
    }

    .mn-list-row:has(.mn-list-row__link:focus-visible) {
      outline: 3px solid var(--focus-ring);
      outline-offset: 2px;
    }

    .mn-list-row__leading {
      display: inline-flex;
      flex: none;
      align-items: center;
      justify-content: center;
    }

    .mn-list-row__leading:empty,
    .mn-list-row__meta:empty,
    .mn-list-row__trailing:empty,
    .mn-list-row__menu:empty {
      display: none;
    }

    .mn-list-row--muted-leading .mn-list-row__leading {
      opacity: 0.55;
    }

    .mn-list-row__content {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      justify-content: center;
      min-width: 0;
      gap: var(--space-1);
    }

    .mn-list-row__title {
      display: block;
      min-width: 0;
      overflow-wrap: anywhere;
      color: var(--text-primary);
      font-size: var(--text-md);
      font-weight: var(--weight-semibold);
      line-height: 1.35;
    }

    .mn-list-row--muted .mn-list-row__title {
      color: var(--text-secondary);
    }

    .mn-list-row__meta {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-1) var(--space-2);
      min-width: 0;
      overflow-wrap: anywhere;
      color: var(--text-secondary);
      font-size: var(--text-sm);
      line-height: 1.35;
    }

    .mn-list-row__trailing {
      display: flex;
      flex: none;
      gap: var(--space-2);
      align-items: center;
      max-width: 40%;
      min-width: 0;
      color: var(--text-secondary);
      font-size: var(--text-sm);
      white-space: nowrap;
    }

    .mn-list-row__menu {
      display: flex;
      flex: none;
      align-items: center;
    }

    @media (prefers-reduced-motion: reduce) {
      .mn-list-row,
      .mn-list-row__link {
        transition: none;
      }
    }
  `,
})
export class ListRowComponent {
  /**
   * The link is named by its title alone and described by its meta, so a
   * screen reader hears a short name and a finder can match the title exactly.
   */
  private readonly instance = nextListRowId++;
  protected readonly titleId = `mn-list-row-${this.instance}-title`;
  protected readonly metaId = `mn-list-row-${this.instance}-meta`;

  readonly routerLink = input.required<readonly unknown[] | string | UrlTree>();
  readonly state = input<NavigationExtras['state']>(undefined);
  readonly variant = input<ListRowVariant>('card');
  readonly mutedLeading = input(false);

  /** For durable tests: the test id belongs on the interactive link. */
  readonly testId = input<string | null>(null);
}
