import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink, type NavigationExtras, type UrlTree } from '@angular/router';

export type ListRowVariant = 'card' | 'flush' | 'plain';

let nextListRowId = 0;

/**
 * The shared shape for a row that leads somewhere.
 *
 * A shelf row answers "what would I open?" and nothing else: an optional
 * leading mark for a meaningful origin, a title, one line saying what is inside
 * and, opposite, its status or way forward. The line prefers what the content
 * says about itself over what is counted about it, and the useful date is when
 * it was last opened. Its facts are separated by a middle dot and break between
 * facts, never inside a word. A long title wraps once, then ends in an
 * ellipsis, and stays whole as the link's accessible name. Every row on a shelf
 * has one height, and a row standing in for work still running is the row it
 * will become, its status leading its line. Hover tints a row only under a
 * mouse.
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
      [class.mn-list-row--flush]="variant() === 'flush' || inCard()"
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
          <span class="mn-list-row__excerpt">
            <ng-content select="[mn-list-row-excerpt]" />
          </span>
          <span class="mn-list-row__meta" [id]="metaId">
            <span class="mn-list-row__facts">
              <ng-content select="[mn-list-row-meta]" />
            </span>
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
  /** The row is one of a card's own rows: the card draws its edge and corners. */
  readonly inCard = input(false);

  /** For durable tests: the test id belongs on the interactive link. */
  readonly testId = input<string | null>(null);
}
