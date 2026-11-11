import { ChangeDetectionStrategy, Component, input, ViewEncapsulation } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../icon/icon.component';

/** Where one side of a pager leads. */
export interface PagerLink {
  readonly title: string;
  readonly link: readonly unknown[] | string;
  /** For durable tests: on the link. */
  readonly testId?: string;
}

/**
 * The way on to the neighbouring pages of a sequence, such as the topics of
 * the guide: a Previous card and a Next card.
 *
 *   <mn-pager label="More topics" [previous]="{ title: 'Your words', link: [...] }" [next]="…" />
 *
 * Both cards share one anatomy: a small eyebrow naming the direction, then the
 * title, with the arrow on the outer side: Previous reads left to right after its
 * arrow, Next is right-aligned and ends in its arrow. Side by side each takes half
 * of the row and a lone Next keeps the right half; a row too narrow for two
 * titles stacks them, Previous first, each at full width.
 *
 * Styles reach the projected links, so they are global and rooted at the element.
 */
@Component({
  selector: 'mn-pager',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [RouterLink, IconComponent],
  template: `
    <nav class="mn-pager__frame" [attr.aria-label]="label()">
      @if (previous(); as side) {
        <a class="mn-pager__card" [routerLink]="side.link" [attr.data-testid]="side.testId ?? null">
          <mn-icon class="mn-pager__arrow" name="back" />
          <span class="mn-pager__text">
            <span class="mn-pager__eyebrow">Previous</span>{{ ' ' }}
            <span class="mn-pager__title">{{ side.title }}</span>
          </span>
        </a>
      }
      @if (next(); as side) {
        <a
          class="mn-pager__card mn-pager__card--next"
          [routerLink]="side.link"
          [attr.data-testid]="side.testId ?? null"
        >
          <span class="mn-pager__text">
            <span class="mn-pager__eyebrow">Next</span>{{ ' ' }}
            <span class="mn-pager__title">{{ side.title }}</span>
          </span>
          <mn-icon class="mn-pager__arrow" name="forward" />
        </a>
      }
    </nav>
  `,
  styles: `
    @use '../../../styles/motion' as motion;
    mn-pager {
      display: block;
      min-width: 0;
      container-type: inline-size;
    }

    mn-pager .mn-pager__frame {
      display: grid;
      gap: var(--stack-gap);
    }

    mn-pager .mn-pager__card {
      display: grid;
      gap: var(--glyph-gap);
      align-items: center;
      min-width: 0;
      min-height: var(--row-min-height);
      padding: var(--row-inset-block) var(--surface-inset);
      border: 1px solid var(--border-subtle-faint);
      border-radius: var(--radius-card);
      background: var(--surface-raised);
      color: var(--text-primary);
      text-decoration: none;
      @include motion.state(box-shadow);
    }

    /* Previous: the arrow, then its text; Next: its text, right-aligned, then the arrow. */
    mn-pager .mn-pager__card:not(.mn-pager__card--next) {
      grid-template-columns: var(--icon-control) minmax(0, 1fr);
    }

    mn-pager .mn-pager__card--next {
      grid-template-columns: minmax(0, 1fr) var(--icon-control);
      text-align: end;
    }

    mn-pager .mn-pager__card--next > .mn-pager__text {
      align-items: flex-end;
    }

    :where(html[data-pointer='mouse']) mn-pager .mn-pager__card:where(:hover),
    mn-pager .mn-pager__card:where(:active) {
      box-shadow: var(--state-layer-fill);
    }

    mn-pager .mn-pager__card:focus-visible {
      outline: 3px solid var(--focus-ring);
      outline-offset: -3px;
    }

    mn-pager .mn-pager__arrow {
      color: var(--text-secondary);
    }

    mn-pager .mn-pager__text {
      display: flex;
      flex-direction: column;
      gap: var(--line-gap);
      min-width: 0;
    }

    mn-pager .mn-pager__eyebrow {
      color: var(--text-secondary);
      font-size: var(--text-xs);
      line-height: var(--leading-snug);
    }

    mn-pager .mn-pager__title {
      overflow-wrap: anywhere;
      font-size: var(--text-md);
      font-weight: var(--weight-semibold);
      line-height: var(--leading-snug);
    }

    @container (min-width: 30rem) {
      mn-pager .mn-pager__frame {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      /* A lone Next stays on the end side, as it is beside a Previous. */
      mn-pager .mn-pager__card--next:first-child {
        grid-column: 2;
      }
    }
  `,
})
export class PagerComponent {
  readonly label = input.required<string>();
  readonly previous = input<PagerLink | null>(null);
  readonly next = input<PagerLink | null>(null);
}
