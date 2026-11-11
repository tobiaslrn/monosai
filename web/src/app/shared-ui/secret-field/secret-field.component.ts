import { ChangeDetectionStrategy, Component, input, model, signal } from '@angular/core';
import { ButtonDirective } from '../button/button';
import { FieldComponent } from '../field/field.component';
import { IconComponent } from '../icon/icon.component';

/**
 * The field for a secret, such as an API key: masked, with a Show button inside
 * it, no autofill and no spelling help, and the characters in the monospace
 * face once they are shown. It lives in a dialog only, never in a settings row.
 *
 *   <mn-secret-field label="API key" [(value)]="draft" [error]="problem()" />
 *
 * It is `mn-field` around the control, so its label sits above it and its one
 * line below is the hint, or the danger line that replaces it.
 */
@Component({
  selector: 'mn-secret-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonDirective, FieldComponent, IconComponent],
  template: `
    <mn-field
      [label]="label()"
      [hint]="hint()"
      [hintId]="hintId"
      [error]="error()"
      [errorId]="errorId"
    >
      <span class="control">
        <input
          class="mn-control"
          autocomplete="off"
          autocapitalize="off"
          autocorrect="off"
          spellcheck="false"
          data-lpignore="true"
          data-1p-ignore
          [class.mn-code]="shown()"
          [type]="shown() ? 'text' : 'password'"
          [attr.placeholder]="placeholder()"
          [attr.data-testid]="testId()"
          [attr.aria-invalid]="error() !== null"
          [attr.aria-describedby]="error() !== null ? errorId : hint() !== null ? hintId : null"
          [value]="value()"
          (input)="onInput($event)"
        />
        <button
          type="button"
          mnButton="icon"
          [attr.aria-label]="shown() ? 'Hide' : 'Show'"
          [attr.aria-pressed]="shown()"
          [title]="shown() ? 'Hide' : 'Show'"
          (click)="shown.set(!shown())"
        >
          <mn-icon [name]="shown() ? 'hide' : 'show'" />
        </button>
      </span>
    </mn-field>
  `,
  styles: `
    :host {
      display: block;
    }

    /* The Show button sits inside the field's end, over room the text leaves for it. */
    .control {
      position: relative;
      display: block;
    }

    input {
      padding-inline-end: var(--touch-target);
    }

    button {
      position: absolute;
      inset-block: 0;
      inset-inline-end: 0;
    }
  `,
})
export class SecretFieldComponent {
  readonly label = input.required<string>();
  readonly value = model('');
  readonly hint = input<string | null>(null);
  /** One line under the field that replaces its hint: what is wrong. */
  readonly error = input<string | null>(null);
  readonly placeholder = input<string | null>(null);
  readonly testId = input<string | null>(null);

  protected readonly shown = signal(false);
  protected readonly hintId = 'mn-secret-field-hint';
  protected readonly errorId = 'mn-secret-field-error';

  protected onInput(event: Event): void {
    this.value.set((event.target as HTMLInputElement).value);
  }
}
