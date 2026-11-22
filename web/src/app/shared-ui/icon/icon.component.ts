import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { LucideDynamicIcon } from '@lucide/angular';
import type { Tone } from '../tone';
import { ICON_SET, type IconName } from './icon-set';

/**
 * The three icon sizes, by role (R35 in the design rules), in pixels. The
 * design-rule guard (`web/scripts/design-rules.mjs`) lists the same numbers.
 *
 * - `inline`: beside caption or secondary text, and status marks.
 * - `control`: in a button, row, chevron or notice; the default.
 * - `feature`: the lead mark of an empty or error state, an icon badge.
 */
export const ICON_SIZES = { inline: 16, control: 20, feature: 24 } as const;

export type IconSize = keyof typeof ICON_SIZES;

/**
 * The pixel sizes still drawn outside the three roles, each by a call site
 * awaiting its redesign (`web/scripts/design-rules-exemptions.json`). Moving
 * one onto a role changes how it looks, so that is the redesign's decision;
 * this list only shrinks.
 */
export type LegacyIconSize = 14 | 18 | 22 | 28;

/** The tones an icon can draw, `quiet` for the secondary text colour, or the text's own. */
export type IconTone =
  'inherit' | 'quiet' | Extract<Tone, 'action' | 'success' | 'warning' | 'danger'>;

/**
 * The glyphs that draw work going round. Inside a control that is busy
 * (`aria-busy`), one of these turns until the work ends; the rule lives with
 * the button states in `_button.scss`.
 */
const TURNING_GLYPHS: Partial<Record<IconName, 'forward' | 'back'>> = {
  sync: 'forward',
  retry: 'back',
};

/**
 * Decorative icon. Every control using one also carries a visible label or an
 * accessible name, so the icon itself is hidden from assistive technology.
 */
@Component({
  selector: 'mn-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideDynamicIcon],
  host: {
    '[class.icon--spin]': 'spin()',
    '[attr.data-turns]': 'turns()',
    '[class.icon--success]': "tone() === 'success'",
    '[class.icon--warning]': "tone() === 'warning'",
    '[class.icon--danger]': "tone() === 'danger'",
    '[class.icon--action]': "tone() === 'action'",
    '[class.icon--quiet]': "tone() === 'quiet'",
  },
  template: `
    <svg
      [lucideIcon]="icon()"
      [size]="pixels()"
      [strokeWidth]="1.8"
      aria-hidden="true"
      focusable="false"
    ></svg>
  `,
  styles: `
    @use '../../../styles/motion' as motion;

    :host {
      display: inline-flex;
      flex: none;
    }
    :host(.icon--success) {
      color: var(--status-success);
    }
    :host(.icon--warning) {
      color: var(--status-warning);
    }
    :host(.icon--danger) {
      color: var(--status-danger);
    }
    :host(.icon--action) {
      color: var(--action-primary);
    }
    :host(.icon--quiet) {
      color: var(--text-secondary);
    }
    /* Work under way whose length is unknown, such as a read of Anki. */
    :host(.icon--spin) {
      @include motion.spin;
    }
  `,
})
export class IconComponent {
  readonly name = input.required<IconName>();
  /** Its role, which sets its size; see {@link ICON_SIZES}. */
  readonly size = input<IconSize>('control');
  /**
   * @deprecated An off-role pixel size, kept only so a call site awaiting its
   * redesign keeps its look. Never add a use: pass a role as `size`.
   */
  readonly legacySize = input<LegacyIconSize | null>(null);
  /** A colour that carries meaning; otherwise the icon takes the text's. */
  readonly tone = input<IconTone>('inherit');
  readonly spin = input(false);

  protected readonly icon = computed(() => ICON_SET[this.name()]);
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- the one place the escape is read
  protected readonly pixels = computed(() => this.legacySize() ?? ICON_SIZES[this.size()]);
  /** Which way the glyph's own arrows point, so it turns the way it is drawn. */
  protected readonly turns = computed(() => TURNING_GLYPHS[this.name()] ?? null);
}
