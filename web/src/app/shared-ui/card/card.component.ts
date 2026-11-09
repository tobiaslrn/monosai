import { ChangeDetectionStrategy, Component, input } from '@angular/core';

let nextCardId = 0;

/**
 * The one raised surface, for content that is not a section of a page: an
 * option compared with another, a draft at the head of the section it will
 * change. Its content runs in one stack. An optional title is the card's own
 * heading; `level` keeps the outline right where the card sits. An action on
 * the whole card (`[mn-card-action]`) sits at the title's end, and `focusable`
 * lets a step move focus to the title to say where the learner now is.
 *
 * A page section with a heading above its card is `mn-section`.
 */
@Component({
  selector: 'mn-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.aria-labelledby]': 'heading() ? headingId : null' },
  template: `
    @if (heading(); as title) {
      <div class="head">
        @if (level() === 2) {
          <h2 class="title" [id]="headingId" [attr.tabindex]="focusable() ? -1 : null">
            {{ title }}
          </h2>
        } @else {
          <h3 class="title" [id]="headingId" [attr.tabindex]="focusable() ? -1 : null">
            {{ title }}
          </h3>
        }
        <ng-content select="[mn-card-action]" />
      </div>
    }
    <ng-content />
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--stack-gap);
      min-width: 0;
      padding: var(--surface-inset);
      border: 1px solid color-mix(in srgb, var(--border-subtle) 35%, transparent);
      border-radius: var(--radius-card);
      background: var(--surface-raised);
    }
    .head {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2) var(--space-3);
      align-items: center;
      justify-content: space-between;
    }
    /* Focus lands on the title to say where the learner is; it is not a control. */
    .title:focus {
      outline: none;
    }
    .title {
      margin: 0;
      font-size: var(--text-lg);
      font-weight: var(--weight-semibold);
      line-height: var(--leading-tight);
    }
  `,
})
export class CardComponent {
  readonly heading = input<string | null>(null);
  readonly level = input<2 | 3>(3);
  readonly focusable = input(false);
  protected readonly headingId = `mn-card-${String(nextCardId++)}-heading`;
}
