import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

/**
 * A labelled switch: the visible noun on the left, the native checkbox with
 * `role="switch"` on the right, the whole row one touch target.
 *
 * The track itself is the shared `mn-switch` control in `_controls.scss`. A
 * disabled row keeps the reason it is disabled as `describedBy`, so the control
 * names the state that prevents it instead of only going dim.
 */
@Component({
  selector: 'mn-switch-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.is-disabled]': 'disabled()' },
  template: `
    <label>
      <span class="label"><ng-content /></span>
      <input
        type="checkbox"
        role="switch"
        class="mn-switch"
        [attr.data-testid]="testId()"
        [attr.aria-describedby]="describedBy()"
        [checked]="checked()"
        [disabled]="disabled()"
        (change)="onChange($event)"
      />
    </label>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }

    label {
      display: flex;
      gap: var(--space-3);
      align-items: center;
      justify-content: space-between;
      min-height: var(--touch-target);
      color: var(--text-primary);
      font-size: var(--text-sm);
      cursor: pointer;
    }

    :host(.is-disabled) label {
      color: var(--text-secondary);
      cursor: not-allowed;
    }

    .label {
      min-width: 0;
    }
  `,
})
export class SwitchRowComponent {
  readonly checked = model(false);
  readonly disabled = input(false);
  /** Lands on the input, which is what tests and assistive technology address. */
  readonly testId = input<string | null>(null);
  readonly describedBy = input<string | null>(null);

  protected onChange(event: Event): void {
    this.checked.set((event.target as HTMLInputElement).checked);
  }
}
