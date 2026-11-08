import { ChangeDetectionStrategy, Component, input, ViewEncapsulation } from '@angular/core';
import { RouterLink, type NavigationExtras } from '@angular/router';

/**
 * A headline that is also the way to the page behind it: one sentence at
 * display size, and an optional quieter line under it.
 *
 *   <mn-standing link="/reading-level" fragment="words">
 *     <span>You know 515 words.</span>
 *     <span mn-standing-detail>Connect Anki to write stories from your own words.</span>
 *   </mn-standing>
 *
 * Two lines of space are held whether or not anything is projected yet, so
 * nothing below moves when the facts arrive. A skeleton would be the
 * alternative, and the design system rules those out.
 *
 * The sentence is the link, and it says so under a pointer and nowhere else.
 * Marking its facts permanently was tried: at display size two underlines read
 * as heavier than the words they were under, and a long phrase has to stay
 * breakable on a narrow screen, so the mark fragmented across lines instead of
 * pointing anywhere.
 *
 * Styles reach projected content and are therefore global, rooted at the
 * element.
 */
@Component({
  selector: 'mn-standing',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [RouterLink],
  template: `
    <a
      class="mn-standing__link"
      [routerLink]="link()"
      [fragment]="fragment()"
      [state]="state()"
      [attr.data-testid]="testId()"
    >
      <span class="mn-standing__headline"><ng-content /></span>
      <span class="mn-standing__detail"><ng-content select="[mn-standing-detail]" /></span>
    </a>
  `,
  styles: `
    @use '../../../styles/breakpoints' as breakpoints;

    mn-standing {
      display: block;
      min-width: 0;
    }

    mn-standing .mn-standing__link {
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: var(--space-3);
      min-height: 3.4rem;
      min-width: 0;
      color: var(--text-primary);
      text-decoration: none;
    }

    mn-standing .mn-standing__headline {
      display: flex;
      gap: var(--space-1);
      align-items: center;
      font-family: var(--font-ui);
      font-size: var(--text-display);
      font-weight: var(--weight-bold);
      letter-spacing: -0.035em;
      line-height: 1.04;
    }

    :where(html[data-pointer='mouse'])
      mn-standing
      .mn-standing__link:where(:hover)
      .mn-standing__headline
      span {
      text-decoration: underline;
    }

    mn-standing .mn-standing__link:focus-visible {
      outline: 3px solid var(--focus-ring);
      outline-offset: 4px;
      border-radius: var(--radius-control);
    }

    mn-standing .mn-standing__detail {
      color: var(--text-secondary);
      font-size: var(--text-sm);
      line-height: var(--leading-snug);
    }

    mn-standing :is(.mn-standing__headline, .mn-standing__detail):empty {
      display: none;
    }

    @media (max-width: breakpoints.$narrow-max) {
      mn-standing .mn-standing__headline {
        font-size: var(--text-2xl);
      }
    }
  `,
})
export class StandingComponent {
  readonly link = input.required<string>();
  readonly fragment = input<string | undefined>(undefined);
  readonly state = input<NavigationExtras['state']>(undefined);
  /** For durable tests: on the link. */
  readonly testId = input<string | null>(null);
}
