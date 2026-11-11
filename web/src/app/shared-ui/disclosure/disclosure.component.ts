import { ChangeDetectionStrategy, Component, input, model, ViewEncapsulation } from '@angular/core';
import { IconComponent } from '../icon/icon.component';

export type DisclosureTone = 'default' | 'quiet' | 'danger';

/**
 * A row that opens to show what it holds: the one disclosure in a card of rows.
 *
 *   <mn-disclosure heading="Technical details" value="Build 1a2b3c">
 *     <mn-facts [facts]="facts" />
 *   </mn-disclosure>
 *
 * The summary is a full row with its title, an optional current value under
 * it, and the up-down chevron of a row that opens in place. The body is padded and stacks what it
 * holds across its width (a button goes in an `mn-cluster` to keep its own);
 * `[flush]` is for a disclosure inside a padded card: the body
 * drops its side padding for content that needs the whole width, such as a
 * set of cards or chips, and the summary's words keep the card's content edge.
 *
 * `quiet` is a secondary branch of the card; `danger` is a destructive one,
 * such as deleting everything.
 */
@Component({
  selector: 'mn-disclosure',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [IconComponent],
  host: {
    '[class.mn-disclosure--quiet]': "tone() === 'quiet'",
    '[class.mn-disclosure--danger]': "tone() === 'danger'",
    '[class.mn-disclosure--flush]': 'flush()',
  },
  template: `
    <details
      class="mn-disclosure__details"
      [attr.name]="name()"
      [open]="open()"
      (toggle)="onToggle($event)"
    >
      <summary class="mn-settings-row mn-disclosure__summary" [attr.data-testid]="testId()">
        <span class="mn-settings-row__label">
          <span class="mn-settings-row__title">{{ heading() }}</span>
          @if (value(); as shown) {
            <span class="mn-settings-row__details" [attr.data-testid]="valueTestId()">{{
              shown
            }}</span>
          }
        </span>
        <span class="mn-settings-row__end">
          <mn-icon class="mn-disclosure__chevron" name="chevron-up-down" />
        </span>
      </summary>
      <div class="mn-disclosure__body" [class.mn-disclosure__body--flush]="flush()">
        <ng-content />
      </div>
    </details>
  `,
  styles: `
    @use '../../../styles/motion' as motion;
    /* Its row lays out against its own width, wherever the disclosure sits. */
    mn-disclosure {
      display: block;
      min-width: 0;
      container-type: inline-size;
    }

    mn-disclosure > .mn-disclosure__details > .mn-disclosure__summary {
      list-style: none;
      cursor: pointer;
    }

    mn-disclosure > .mn-disclosure__details > .mn-disclosure__summary::-webkit-details-marker {
      display: none;
    }

    :where(html[data-pointer='mouse'])
      mn-disclosure
      > .mn-disclosure__details
      > .mn-disclosure__summary:where(:hover),
    mn-disclosure > .mn-disclosure__details > .mn-disclosure__summary:where(:active) {
      box-shadow: var(--state-layer-fill);
    }

    mn-disclosure > .mn-disclosure__details > .mn-disclosure__summary:focus-visible {
      outline-offset: -3px;
    }

    mn-disclosure .mn-disclosure__chevron {
      flex: none;
      color: var(--text-secondary);
    }

    /* The fold opens its height rather than appearing under the summary. */
    mn-disclosure > .mn-disclosure__details {
      @include motion.expand;
    }

    mn-disclosure.mn-disclosure--quiet > .mn-disclosure__details > .mn-disclosure__summary {
      color: var(--text-secondary);
    }

    mn-disclosure.mn-disclosure--danger
      > .mn-disclosure__details
      > .mn-disclosure__summary
      .mn-settings-row__title {
      color: var(--status-danger);
    }

    mn-disclosure > .mn-disclosure__details > .mn-disclosure__body {
      display: flex;
      flex-direction: column;
      gap: var(--stack-gap);
      min-width: 0;
      padding: var(--group-gap) var(--surface-inset) var(--stack-gap);
      overflow-wrap: anywhere;
      border-top: 1px solid var(--border-subtle);
    }

    mn-disclosure > .mn-disclosure__details > .mn-disclosure__body--flush {
      overflow-wrap: normal;
      padding: var(--space-1) 0 var(--surface-inset);
      border-top: 0;
    }

    /*
     * Flush inside a padded card: the summary reaches the card's edges, so its
     * hover spans the card, while its words keep the card's content edge.
     */
    mn-disclosure.mn-disclosure--flush > .mn-disclosure__details > .mn-disclosure__summary {
      margin-inline: calc(-1 * var(--surface-inset));
    }
  `,
})
export class DisclosureComponent {
  readonly heading = input.required<string>();
  /** What is set inside, stated on the closed row under its label, as a setting's value is. */
  readonly value = input<string | null>(null);
  readonly tone = input<DisclosureTone>('default');
  /** The body runs the full width under the row, for choices that need it all. */
  readonly flush = input(false);
  /** Names the summary, the control that opens it. */
  readonly testId = input<string | null>(null);
  /** For durable tests: on the stated value. */
  readonly valueTestId = input<string | null>(null);
  /** Disclosures sharing a name open one at a time. */
  readonly name = input<string | null>(null);
  readonly open = model(false);

  protected onToggle(event: Event): void {
    const open = (event.target as HTMLDetailsElement).open;
    if (open !== this.open()) {
      this.open.set(open);
    }
  }
}
