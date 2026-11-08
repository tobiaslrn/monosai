import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

/**
 * A checkbox and the words it is named by, on one line and pressable as one.
 *
 *   <mn-checkbox [(checked)]="includeSubdecks">Include subdecks</mn-checkbox>
 *
 * A setting that takes effect at once is an `mn-switch-row`; a checkbox is a
 * choice inside a form that something else applies.
 */
@Component({
  selector: 'mn-checkbox',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label>
      <input
        type="checkbox"
        [checked]="checked()"
        [disabled]="disabled()"
        [attr.data-testid]="testId()"
        (change)="onChange($event)"
      />
      <span><ng-content /></span>
    </label>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }

    label {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      align-items: center;
      min-height: var(--touch-target);
      font-size: var(--text-sm);
      cursor: pointer;
    }

    input:disabled,
    input:disabled + span {
      cursor: not-allowed;
    }
  `,
})
export class CheckboxComponent {
  readonly checked = model(false);
  readonly disabled = input(false);
  /** For durable tests: on the input. */
  readonly testId = input<string | null>(null);

  protected onChange(event: Event): void {
    this.checked.set((event.target as HTMLInputElement).checked);
  }
}
