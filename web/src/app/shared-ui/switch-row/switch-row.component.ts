import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';

let nextSwitchRowId = 0;

/**
 * An on-or-off setting that applies at once: the settings row (`mn-settings-row`)
 * with a switch for its end. Its label, an optional line under it, and the
 * native checkbox with `role="switch"`; the whole row is one touch target.
 *
 *   <mn-switch-row testId="furigana" [(checked)]="furigana">Furigana</mn-switch-row>
 *
 * The track itself is the shared `mn-switch` control in `_controls.scss`. A
 * disabled row says why in its own line, which describes the switch, so the
 * control names the state that prevents it instead of only going dim.
 */
@Component({
  selector: 'mn-switch-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.is-disabled]': 'disabled()' },
  template: `
    <label
      class="mn-settings-row mn-settings-row--switch"
      [class.mn-settings-row--disabled]="disabled()"
    >
      <span class="mn-settings-row__label">
        <span class="mn-settings-row__title"><ng-content /></span>
        @if (description(); as line) {
          <span class="mn-settings-row__details" [id]="descriptionId">{{ line }}</span>
        }
      </span>
      <span class="mn-settings-row__end">
        <input
          type="checkbox"
          role="switch"
          class="mn-switch"
          [attr.data-testid]="testId()"
          [attr.aria-describedby]="describedByIds()"
          [checked]="checked()"
          [disabled]="disabled()"
          (change)="onChange($event)"
        />
      </span>
    </label>
  `,
  styles: `
    :host {
      display: block;
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
  /** One line under the label: what the switch does, or why it cannot be turned on. */
  readonly description = input<string | null>(null);

  protected readonly descriptionId = `mn-switch-row-${String(nextSwitchRowId++)}-description`;
  protected readonly describedByIds = computed(() => {
    const ids = [this.description() === null ? null : this.descriptionId, this.describedBy()];
    const named = ids.filter((id) => id !== null);
    return named.length === 0 ? null : named.join(' ');
  });

  protected onChange(event: Event): void {
    this.checked.set((event.target as HTMLInputElement).checked);
  }
}
