import { ChangeDetectionStrategy, Component, input, ViewEncapsulation } from '@angular/core';
import { IconComponent } from '../icon/icon.component';

let nextOutcomeId = 0;

/**
 * The whole screen given to where a long task stands: running, done, or
 * stopped. Everything is centred on one raised panel, because there is
 * nothing else on the screen to do.
 *
 *   <mn-outcome mark="success" eyebrow="Saved to your library" heading="猫の話" headingLang="ja">
 *     <p class="mn-hint">Preparing audio</p>
 *     <a mn-outcome-action mnButton="primary" …>Open story</a>
 *   </mn-outcome>
 *
 * `progress` is the panel of a task still running: it is tall, so the screen
 * does not jump as the words in it change, its body is centred in it, and its
 * actions sit at its foot. A result has its actions in a centred row that
 * stacks on a phone.
 *
 * The panel is a region named by its heading, or by `label` when it has none
 * or the heading is not a name for it. Styles reach the projected actions and
 * are therefore global, rooted at the element.
 */
@Component({
  selector: 'mn-outcome',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [IconComponent],
  host: {
    role: 'region',
    '[class.mn-outcome--progress]': "variant() === 'progress'",
    '[attr.aria-label]': 'label()',
    '[attr.aria-labelledby]': 'label() || !heading() ? null : headingId',
  },
  template: `
    @if (mark() === 'success') {
      <span class="mn-outcome__mark" aria-hidden="true"><mn-icon name="check" [size]="28" /></span>
    }
    @if (eyebrow(); as text) {
      <p class="mn-outcome__eyebrow">{{ text }}</p>
    }
    @if (heading(); as text) {
      <h2
        class="mn-outcome__heading"
        [id]="headingId"
        [attr.lang]="headingLang()"
        [attr.data-testid]="headingTestId()"
      >
        {{ text }}
      </h2>
    }
    <div class="mn-outcome__body"><ng-content /></div>
    <div class="mn-outcome__actions"><ng-content select="[mn-outcome-action]" /></div>
  `,
  styles: `
    @use '../../../styles/breakpoints' as breakpoints;

    mn-outcome {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      align-items: center;
      justify-content: center;
      min-height: 26.25rem;
      padding: var(--space-6);
      /* The card surface, at the page measure like every other page's cards. */
      border: 1px solid var(--border-subtle-faint);
      border-radius: var(--radius-card);
      background: var(--surface-raised);
      text-align: center;
    }

    mn-outcome .mn-outcome__mark {
      display: grid;
      place-items: center;
      width: 4rem;
      height: 4rem;
      border-radius: var(--radius-mark);
      background: var(--status-success-soft);
      color: var(--status-success);
    }

    mn-outcome .mn-outcome__eyebrow {
      margin: 0;
      color: var(--text-secondary);
      font-size: var(--text-sm);
      font-weight: var(--weight-semibold);
    }

    mn-outcome .mn-outcome__heading {
      margin: 0;
      font-size: var(--text-2xl);
      letter-spacing: -0.025em;
    }

    mn-outcome .mn-outcome__heading:lang(ja) {
      font-family: var(--font-japanese);
      font-weight: var(--weight-semibold);
      letter-spacing: normal;
    }

    mn-outcome .mn-outcome__body {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      align-items: center;
      max-width: var(--page-measure);
    }

    mn-outcome .mn-outcome__body > :where(p) {
      margin: 0;
    }

    mn-outcome .mn-outcome__actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      justify-content: center;
    }

    mn-outcome .mn-outcome__actions:empty {
      display: none;
    }

    mn-outcome.mn-outcome--progress {
      justify-content: flex-start;
      min-height: 33.75rem;
    }

    mn-outcome.mn-outcome--progress .mn-outcome__body {
      flex: 1;
      justify-content: center;
    }

    @media (max-width: breakpoints.$narrow-max) {
      mn-outcome,
      mn-outcome.mn-outcome--progress {
        min-height: 0;
        padding: var(--space-5) var(--space-4);
      }

      /* Still tall enough on a phone that a longer stage does not move the button. */
      mn-outcome.mn-outcome--progress .mn-outcome__body {
        min-height: 21.25rem;
      }

      mn-outcome:not(.mn-outcome--progress) .mn-outcome__actions {
        width: 100%;
      }

      mn-outcome:not(.mn-outcome--progress) .mn-outcome__actions > * {
        flex: 1 1 100%;
      }
    }
  `,
})
export class OutcomeComponent {
  readonly variant = input<'result' | 'progress'>('result');
  readonly mark = input<'success' | null>(null);
  /** A short line above the heading saying what kind of outcome this is. */
  readonly eyebrow = input<string | null>(null);
  readonly heading = input<string | null>(null);
  readonly headingLang = input<string | null>(null);
  /** For durable tests: on the heading. */
  readonly headingTestId = input<string | null>(null);
  /** Names the region when the heading does not. */
  readonly label = input<string | null>(null);
  protected readonly headingId = `mn-outcome-${String(nextOutcomeId++)}-heading`;
}
