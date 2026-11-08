import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

export interface FilterOption {
  readonly value: string;
  readonly label: string;
}

/**
 * A compact picker that narrows what a list shows, drawn as a pill so it reads
 * as a filter rather than a form field.
 *
 *   <mn-filter-select label="Filter by source" [options]="sources" [(value)]="sourceId" />
 *
 * It keeps a readable width beside its neighbours and never grows past one:
 * with the text too large for both, the neighbour wraps below it rather than
 * the picker being squeezed until its value is cut off.
 */
@Component({
  selector: 'mn-filter-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <select
      class="mn-control"
      [attr.aria-label]="label()"
      [attr.data-testid]="testId()"
      (change)="onChange($event)"
    >
      @for (option of options(); track option.value) {
        <option [value]="option.value" [selected]="option.value === value()">
          {{ option.label }}
        </option>
      }
    </select>
  `,
  styles: `
    :host {
      display: block;
      flex: 1 1 9rem;
      min-width: 0;
      max-width: 16rem;
    }

    select {
      width: 100%;
      border-radius: var(--radius-pill);
      font-weight: var(--weight-medium);
    }
  `,
})
export class FilterSelectComponent {
  readonly label = input.required<string>();
  readonly options = input.required<readonly FilterOption[]>();
  readonly value = model('');
  /** For durable tests: on the select. */
  readonly testId = input<string | null>(null);

  protected onChange(event: Event): void {
    this.value.set((event.target as HTMLSelectElement).value);
  }
}
