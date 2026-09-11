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
