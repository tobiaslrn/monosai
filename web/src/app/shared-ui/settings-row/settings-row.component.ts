import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink, type NavigationExtras } from '@angular/router';
import { IconComponent } from '../icon/icon.component';
import type { IconName } from '../icon/icon-set';

/** What pressing a row does: a plain action, or one that destroys something. */
export type SettingsRowAction = 'accent' | 'danger';

/**
 * What the row promises with its trailing end:
 *
 * - `nothing`: a press does something now, or there is nothing to press.
 * - `nav`: a press opens a new page or dialog (`›`).
 * - `choice`: a press opens a list in place (`⌃⌄`), drawn by the `mn-select`
 *   projected into the row.
 * - `control`: the projected control changes a setting now (a segmented choice).
 */
export type SettingsRowEnd = 'nothing' | 'nav' | 'choice' | 'control';

/** Where a setting stands, as the tone of the mark and words that lead its summary. */
export type SettingsRowStatus = 'success' | 'warning' | 'danger' | 'info';

const STATUS_ICON: Record<SettingsRowStatus, IconName> = {
  success: 'synced',
  warning: 'alert',
  danger: 'alert',
  info: 'info',
};

let nextSettingsRowId = 0;

/**
 * The one row of a card of rows: a label, an optional summary under it, and
 * one trailing end. A setting, a fact and an action are all this row; they
 * differ only in the end, and the whole row is the hit target.
 *
 *   <mn-settings-row label="Text models" end="nav" link="/settings/text-models"
 *                    status="success" statusText="Ready" summary="Gemini 2.5 Flash" />
 *
 * - A setting's value is its summary, under the label. Where it stands
 *   (`status`, `statusText`) leads the summary, so it survives truncation.
 * - A plain fact's value is at the end (`value`).
 * - A choice projects an `mn-select`, which is the row's
 *   own words and chevron.
 * - A row that does something is an `action` (`accent`, or `danger` when it
 *   destroys), one button over the whole row that emits `pressed`. A `link` or an
 *   `end` of `nav` makes the whole row one link or button as well.
 *
 * The host is the `mn-settings-row`, so the card's divider rules, which address
 * rows as children of the card, group, and sub-row containers, keep working.
 * More words for the summary are a span carrying `mn-settings-row-detail`.
 */
@Component({
  selector: 'mn-settings-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, RouterLink],
  host: {
    class: 'mn-settings-row',
    '[class.mn-settings-row--accent]': "action() === 'accent'",
    '[class.mn-settings-row--danger]': "action() === 'danger'",
    '[class.mn-settings-row--disabled]': 'disabled()',
    '[attr.aria-busy]': "busy() ? 'true' : null",
  },
  template: `
    <span class="mn-settings-row__label">
      <span class="mn-settings-row__title" [attr.id]="titleId()">{{ label() }}</span>
      <span class="mn-settings-row__details" [id]="detailId">
        @if (status(); as tone) {
          <span class="mn-settings-row__status" [attr.data-tone]="tone"
            ><mn-icon [name]="statusIcon()" [size]="16" />{{ statusText() }}</span
          >
          @if (summary() !== null || code() !== null) {
            <span aria-hidden="true"> · </span>
          }
        }
        @if (summary(); as text) {
          {{ text }}
        }
        @if (code(); as identifier) {
          @if (summary() !== null) {
            <span aria-hidden="true"> · </span>
          }
          <span class="mn-code">{{ identifier }}</span>
        }
        <ng-content select="[mn-settings-row-detail]" />
      </span>
    </span>
    <span class="mn-settings-row__end">
      @if (value(); as text) {
        <span class="mn-settings-value">{{ text }}</span>
      }
      <ng-content />
      @if (glyph(); as name) {
        <mn-icon [name]="name" />
      }
      @if (end() === 'nav') {
        <mn-icon class="mn-settings-chevron" name="chevron-right" />
      }
    </span>
    @if (link() !== null && !disabled()) {
      <!-- eslint-disable-next-line @angular-eslint/template/elements-content -- it is named by the row's title and described by its summary -->
      <a
        class="mn-settings-press"
        [routerLink]="link()"
        [state]="state()"
        [attr.aria-labelledby]="titleId()"
        [attr.aria-describedby]="detailId"
        [attr.data-testid]="testId()"
      ></a>
    } @else if (pressable()) {
      <!-- eslint-disable-next-line @angular-eslint/template/elements-content -- it is named by the row's title and described by its summary -->
      <button
        type="button"
        class="mn-settings-press"
        [disabled]="disabled()"
        [attr.aria-busy]="busy() ? 'true' : null"
        [attr.aria-labelledby]="titleId()"
        [attr.aria-describedby]="detailId"
        [attr.aria-haspopup]="opens()"
        [attr.popovertarget]="controls()"
        [attr.aria-controls]="controls()"
        [attr.aria-expanded]="controls() === null ? null : expanded()"
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
  readonly end = input<SettingsRowEnd>('nothing');
  /** The row does something now; it is drawn in the accent colour, or the danger colour. */
  readonly action = input<SettingsRowAction | null>(null);
  /** The page the whole row leads to. */
  readonly link = input<readonly unknown[] | string | null>(null);
  readonly state = input<NavigationExtras['state']>(undefined);
  /** The value under the label: what the setting is now. */
  readonly summary = input<string | null>(null);
  /** An identifier that follows the summary, set in the monospace face: a model's id. */
  readonly code = input<string | null>(null);
  /** Where it stands, leading the summary; with `statusText`. */
  readonly status = input<SettingsRowStatus | null>(null);
  readonly statusText = input('');
  /** A plain fact's value, at the end. */
  readonly value = input<string | null>(null);
  /** What an action does, as a glyph at the end. */
  readonly glyph = input<IconName | null>(null);
  /** What opens when a `nav` row is pressed, for assistive technology. */
  readonly opens = input<'dialog' | null>(null);
  /** The overlay a pressed row opens, by its id, so the browser holds the relationship. */
  readonly controls = input<string | null>(null);
  readonly expanded = input(false);
  readonly disabled = input(false);
  /** The action has started work and is holding it: the row keeps its size and its glyph turns. */
  readonly busy = input(false);
  /** For durable tests: on the row's link or button. */
  readonly testId = input<string | null>(null);
  readonly pressed = output<void>();

  protected readonly pressable = computed(
    () => this.action() !== null || this.end() === 'nav' || this.link() !== null,
  );
  protected readonly statusIcon = computed(() => STATUS_ICON[this.status() ?? 'info']);
  protected readonly titleId = computed(
    () => this.labelId() ?? (this.pressable() ? this.ownTitleId : null),
  );
}
