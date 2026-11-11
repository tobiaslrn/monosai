import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { IconComponent } from '../icon/icon.component';

/**
 * The one search box: a magnifier inside the field, and a clear control drawn
 * in the field's own text colour.
 *
 *   <mn-search-field label="Search Japanese or English" [(value)]="query" />
 *
 * The label is the field's accessible name and, unless a shorter `placeholder`
 * is given, its placeholder, since a search box has no room for a visible label
 * above it. A long label is for assistive technology; the placeholder must fit
 * the field on a phone.
 */
@Component({
  selector: 'mn-search-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <label>
      <mn-icon class="icon" name="search" [size]="20" />
      <input
        class="mn-control"
        type="search"
        [placeholder]="placeholder() ?? label()"
        [attr.aria-label]="label()"
        [attr.data-testid]="testId()"
        [value]="value()"
        (input)="onInput($event)"
      />
    </label>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }

    label {
      position: relative;
      display: block;
      min-width: 0;
    }

    .icon {
      position: absolute;
      top: 50%;
      left: var(--space-3);
      color: var(--text-secondary);
      transform: translateY(-50%);
      pointer-events: none;
    }

    input {
      min-height: 3rem;
      padding-inline-start: 2.75rem;
    }

    /*
     * The browser draws its own clear control in its default blue on Android.
     * Draw it instead as a cross in the field's own text colour, so it follows the theme.
     */
    input::-webkit-search-cancel-button {
      -webkit-appearance: none;
      appearance: none;
      width: 1.25rem;
      height: 1.25rem;
      background-color: var(--text-secondary);
      -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.5' stroke-linecap='round'%3E%3Cpath d='M18 6 6 18M6 6l12 12'/%3E%3C/svg%3E")
        center / contain no-repeat;
      mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.5' stroke-linecap='round'%3E%3Cpath d='M18 6 6 18M6 6l12 12'/%3E%3C/svg%3E")
        center / contain no-repeat;
      cursor: pointer;
    }
  `,
})
export class SearchFieldComponent {
  readonly label = input.required<string>();
  /** What the empty field says, when the accessible name is too long to fit it. */
  readonly placeholder = input<string | null>(null);
  readonly value = model('');
  /** For durable tests: on the input. */
  readonly testId = input<string | null>(null);

  protected onInput(event: Event): void {
    this.value.set((event.target as HTMLInputElement).value);
  }
}
