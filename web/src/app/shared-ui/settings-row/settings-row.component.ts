import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * One row of a settings card: a title (with optional hint and result lines) on
 * the left and its control or value on the right.
 *
 * The host is the `mn-settings-row`, so the card's divider rules, which address
 * rows as children of the card, group, and sub-row containers, keep working.
 * The projected control sits in the row's end slot. A detail line is a span
 * carrying `mn-settings-row-detail` and the shared `mn-settings-row__hint` or
 * `mn-settings-row__result` class:
 *
 *   <mn-settings-row label="Keep data">
 *     <span mn-settings-row-detail class="mn-settings-row__hint">…</span>
 *     <button class="mn-button">Protect</button>
 *   </mn-settings-row>
 */
@Component({
  selector: 'mn-settings-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'mn-settings-row' },
  template: `
    <div class="mn-settings-row__label">
      <span class="mn-settings-row__title" [attr.id]="labelId()">{{ label() }}</span>
      <ng-content select="[mn-settings-row-detail]" />
    </div>
    <div class="mn-settings-row__end" [class.mn-actions]="actions()">
      <ng-content />
    </div>
  `,
})
export class SettingsRowComponent {
  readonly label = input.required<string>();
  /** The id controls in the row point `aria-labelledby` at. */
  readonly labelId = input<string | null>(null);
  /** Lays buttons in the end slot out as the shared actions row. */
  readonly actions = input(false);
}
