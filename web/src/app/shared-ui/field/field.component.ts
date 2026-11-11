import { IconComponent } from '../icon/icon.component';
import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * One form control with its visible label above it and, below it, one line:
 * its hint, or — when the value is wrong — what is wrong with it, which
 * replaces the hint.
 *
 *   <mn-field label="Tokens" hint="Up to 65,536 tokens">
 *     <input type="text" … />
 *   </mn-field>
 *
 * Without a `label` the control is named from elsewhere (`aria-labelledby` on
 * a row title) and the field only keeps it and its error together. The line
 * carries `errorId` (or `hintId`), which the control names in
 * `aria-describedby`; the error is announced.
 */
@Component({
  selector: 'mn-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, NgTemplateOutlet],
  host: { class: 'mn-field' },
  template: `
    <ng-template #control><ng-content /></ng-template>
    @if (label(); as text) {
      <!-- eslint-disable-next-line @angular-eslint/template/label-has-associated-control -- the control is projected into the label -->
      <label class="label">
        <span>{{ text }}</span>
        <ng-container [ngTemplateOutlet]="control" />
      </label>
    } @else {
      <ng-container [ngTemplateOutlet]="control" />
    }
    @if (error(); as message) {
      <p class="mn-field-error" role="alert" [id]="errorId()">
        <mn-icon name="warning" [size]="16" /><span>{{ message }}</span>
      </p>
    } @else if (hint(); as text) {
      <p class="mn-hint" [id]="hintId()">{{ text }}</p>
    }
  `,
  styles: `
    :host {
      min-width: 0;
    }
    .label {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }
  `,
})
export class FieldComponent {
  readonly label = input<string | null>(null);
  readonly error = input<string | null>(null);
  readonly errorId = input<string | null>(null);
  /** What to enter, until something is wrong. */
  readonly hint = input<string | null>(null);
  readonly hintId = input<string | null>(null);
}
