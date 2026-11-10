import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { LucideDynamicIcon } from '@lucide/angular';
import { ICON_SET, type IconName } from './icon-set';

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
    '[class.icon--accent]': "tone() === 'accent'",
    '[class.icon--quiet]': "tone() === 'quiet'",
  },
  template: `
    <svg
      [lucideIcon]="icon()"
      [size]="size()"
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
    :host(.icon--accent) {
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
  readonly size = input(20);
  /** A colour that carries meaning; otherwise the icon takes the text's. */
  readonly tone = input<'inherit' | 'quiet' | 'accent' | 'success' | 'warning' | 'danger'>(
    'inherit',
  );
  readonly spin = input(false);

  protected readonly icon = computed(() => ICON_SET[this.name()]);
  /** Which way the glyph's own arrows point, so it turns the way it is drawn. */
  protected readonly turns = computed(() => TURNING_GLYPHS[this.name()] ?? null);
}
