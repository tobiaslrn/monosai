import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IconComponent } from '../icon/icon.component';
import type { IconName } from '../icon/icon-set';

/** Where something stands, as the tone of the mark and words that lead its line. */
export type StatusTone = 'success' | 'warning' | 'danger' | 'info';

const STATUS_ICON: Record<StatusTone, IconName> = {
  success: 'synced',
  warning: 'alert',
  danger: 'alert',
  info: 'info',
};

/**
 * The one way a status leads a secondary line: a tone's mark, then its words,
 * in the tone's colour, so it survives truncation of what follows. A settings
 * row's summary and a shelf row's facts both lead with it.
 *
 *   <mn-status-lead tone="warning" text="Needs attention" />
 *
 * The styles are the shared status styles (`_settings.scss`), keyed on the
 * element's class.
 */
@Component({
  selector: 'mn-status-lead',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `<span class="mn-status-lead" [attr.data-tone]="tone()"
    ><mn-icon [name]="icon()" [size]="16" />{{ text() }}</span
  >`,
})
export class StatusLeadComponent {
  readonly tone = input.required<StatusTone>();
  readonly text = input.required<string>();
  protected readonly icon = computed(() => STATUS_ICON[this.tone()]);
}
