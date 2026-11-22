import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * How much of a limit a field has used, under the field. Past the limit it
 * turns to the danger colour, beside the error that says what to remove.
 *
 * Every counter keeps out of the way until its field is roughly 80% full, then
 * stays; past the limit it is always shown. While hidden, it is left out of the
 * field's `aria-describedby`. A count has one form across the application
 * (`formatCount`).
 *
 *   <mn-count id="notes-count" [over]="tooLong()">120 of 200 characters</mn-count>
 */
@Component({
  selector: 'mn-count',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.is-over]': 'over()' },
  template: `<ng-content />`,
  styles: `
    :host {
      display: block;
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    :host(.is-over) {
      color: var(--status-danger);
      font-weight: var(--weight-semibold);
    }
  `,
})
export class CountComponent {
  readonly over = input(false);
}
