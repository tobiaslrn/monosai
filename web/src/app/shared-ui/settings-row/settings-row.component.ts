import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

/** What pressing a row does: a plain action, or one that destroys something. */
export type SettingsRowAction = 'accent' | 'danger';

let nextSettingsRowId = 0;

/**
 * One row of a settings card: a title (with optional hint and result lines) at
 * the start and its value, or a trailing glyph, at the end.
 *
 * A setting is a row: the row shows the label and the current value, and the
 * whole row is the control. There are two kinds.
 *
 * - A choice: the projected control is a `mn-select` or `mn-model-picker`. Its
 *   button reads as the value and the up-down chevron, and its press target
 *   stretches across the whole row.
 * - An action: the row gives `action`, and the whole row is one button that
 *   emits `pressed`. The title is in the accent colour, or the danger colour
 *   for an action that destroys something. The end holds a status or a glyph,
 *   never a button.
 *
 * The host is the `mn-settings-row`, so the card's divider rules, which address
 * rows as children of the card, group, and sub-row containers, keep working.
 * A note — one muted line that says what the control cannot, across the whole
 * row beneath both halves — is a span carrying `mn-settings-row-note` and
 * `mn-settings-row__note`. A detail line is a span carrying
 * `mn-settings-row-detail` and the shared `mn-settings-row__hint` or
 * `mn-settings-row__result` class:
 *
 *   <mn-settings-row label="Protect storage" action="accent" (pressed)="protect()">
 *     <span mn-settings-row-detail class="mn-settings-row__hint">Not protected</span>
 *   </mn-settings-row>
 */
@Component({
  selector: 'mn-settings-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'mn-settings-row',
    '[class.mn-settings-row--accent]': "action() === 'accent'",
    '[class.mn-settings-row--danger]': "action() === 'danger'",
    '[class.mn-settings-row--disabled]': 'disabled()',
    '[attr.aria-busy]': "busy() ? 'true' : null",
  },
  template: `
    <div class="mn-settings-row__label">
      <span class="mn-settings-row__title" [attr.id]="titleId()">{{ label() }}</span>
      <span class="mn-settings-row__details" [id]="detailId"
        ><ng-content select="[mn-settings-row-detail]"
      /></span>
    </div>
    <div class="mn-settings-row__end mn-trailing">
      <ng-content />
    </div>
    <ng-content select="[mn-settings-row-note]" />
    @if (action() !== null) {
      <!-- eslint-disable-next-line @angular-eslint/template/elements-content -- it is named by the row's title and described by its detail -->
      <button
        type="button"
        class="mn-settings-press"
        [disabled]="disabled()"
        [attr.aria-busy]="busy() ? 'true' : null"
        [attr.aria-labelledby]="titleId()"
        [attr.aria-describedby]="detailId"
        [attr.data-testid]="testId()"
        (click)="pressed.emit()"
      ></button>
    }
  `,
})
export class SettingsRowComponent {
  private readonly instance = nextSettingsRowId++;
  protected readonly detailId = `mn-settings-row-${String(this.instance)}-detail`;
  private readonly ownTitleId = `mn-settings-row-${String(this.instance)}-title`;

  readonly label = input.required<string>();
  /** The id controls in the row point `aria-labelledby` at. */
  readonly labelId = input<string | null>(null);
  /** Makes the whole row one button: a plain action, or one that destroys something. */
  readonly action = input<SettingsRowAction | null>(null);
  readonly disabled = input(false);
  /** The action has started work and is holding it: the row keeps its size and its glyph turns. */
  readonly busy = input(false);
  /** For durable tests: on the row's button. */
  readonly testId = input<string | null>(null);
  readonly pressed = output<void>();

  protected readonly titleId = computed(
    () => this.labelId() ?? (this.action() === null ? null : this.ownTitleId),
  );
}
