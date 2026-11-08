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
 * The summary is a full row with its title, an optional current value, and a
 * chevron that turns when it is open. The body is padded and stacks what it
 * holds across its width (a button goes in an `mn-cluster` to keep its own);
 * `[rows]` gives the padding up to rows that bring their own, indented under
 * the title, and `[flush]` drops the side padding for content that needs the
 * whole width, such as a set of cards or chips.
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
        </span>
        <span class="mn-settings-row__end">
          @if (value(); as shown) {
            <span
              class="mn-settings-value"
              [class.mn-disclosure__value--set]="valueSet()"
              [attr.data-testid]="valueTestId()"
              >{{ shown }}</span
            >
          }
          <mn-icon class="mn-disclosure__chevron" name="chevron-right" [size]="18" />
        </span>
      </summary>
      <div
        class="mn-disclosure__body"
        [class.mn-disclosure__body--rows]="rows()"
        [class.mn-disclosure__body--flush]="flush()"
      >
        <ng-content />
      </div>
    </details>
  `,
  styles: `
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
      > .mn-disclosure__summary:where(:hover) {
      background: var(--surface-sunken-hover);
    }

    mn-disclosure > .mn-disclosure__details > .mn-disclosure__summary:focus-visible {
      outline-offset: -3px;
    }

    mn-disclosure .mn-disclosure__chevron {
      flex: none;
      color: var(--text-secondary);
      transition: transform var(--motion-fast) var(--ease-standard);
    }

    mn-disclosure
      > .mn-disclosure__details[open]
      > .mn-disclosure__summary
      .mn-disclosure__chevron {
      transform: rotate(90deg);
    }

    /* A value the learner chose, rather than the default, reads as chosen. */
    mn-disclosure .mn-disclosure__value--set {
      color: var(--action-primary-text);
      font-weight: var(--weight-semibold);
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
      gap: var(--space-3);
      min-width: 0;
      padding: var(--space-2) var(--space-4) var(--space-3);
      overflow-wrap: anywhere;
      border-top: 1px solid var(--border-subtle);
    }

    mn-disclosure > .mn-disclosure__details > .mn-disclosure__body--flush {
      overflow-wrap: normal;
      padding: var(--space-1) 0 var(--space-4);
      border-top: 0;
    }

    mn-disclosure > .mn-disclosure__details > .mn-disclosure__body--rows {
      gap: 0;
      overflow-wrap: normal;
      padding: 0 var(--space-4) var(--space-2) var(--space-7);
      border-top: 0;
    }

    @media (max-width: 30rem) {
      mn-disclosure > .mn-disclosure__details > .mn-disclosure__body--rows {
        padding-inline: var(--space-3);
      }
    }

    @container (max-width: 16em) {
      mn-disclosure > .mn-disclosure__details > .mn-disclosure__body--rows {
        padding-inline: min(var(--space-2), 8px);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      mn-disclosure .mn-disclosure__chevron {
        transition: none;
      }
    }
  `,
})
export class DisclosureComponent {
  readonly heading = input.required<string>();
  /** What is set inside, stated on the closed row. */
  readonly value = input<string | null>(null);
  readonly tone = input<DisclosureTone>('default');
  /** The body is rows with their own padding, indented under the title. */
  readonly rows = input(false);
  /** The body runs the full width under the row, for choices that need it all. */
  readonly flush = input(false);
  /** Names the summary, the control that opens it. */
  readonly testId = input<string | null>(null);
  /** For durable tests: on the stated value. */
  readonly valueTestId = input<string | null>(null);
  /** The value is one the learner chose rather than the default. */
  readonly valueSet = input(false);
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
