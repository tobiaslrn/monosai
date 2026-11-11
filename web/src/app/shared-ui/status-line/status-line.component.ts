import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IconComponent } from '../icon/icon.component';
import type { IconName } from '../icon/icon-set';

/** What the line says about its group; each tone has one meaning, app-wide. */
export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'setup';

const ICONS: Record<StatusTone, IconName> = {
  success: 'synced',
  warning: 'alert',
  danger: 'alert',
  info: 'info',
  setup: 'alert',
};

/**
 * Where a group stands: one line under its card, a mark in the tone's colour,
 * words, and at most one action as a link at the end of the sentence.
 *
 *   <mn-status-line tone="danger">
 *     Test failed: the model returned no text.
 *     <button mn-status-line-action type="button" (click)="retry()">Test again</button>
 *   </mn-status-line>
 *
 * A failure is announced as an alert; anything else is a polite status. It is
 * the only place a group's state is written, so a pill or a note beside it
 * would only repeat it.
 */
@Component({
  selector: 'mn-status-line',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  host: {
    class: 'mn-status-line',
    '[attr.data-tone]': 'tone()',
    '[attr.role]': "tone() === 'danger' ? 'alert' : 'status'",
  },
  template: `
    <mn-icon [name]="icon()" [size]="16" />
    <span class="mn-status-line__words"
      ><ng-content /> <ng-content select="[mn-status-line-action]"
    /></span>
  `,
})
export class StatusLineComponent {
  readonly tone = input<StatusTone>('info');
  protected readonly icon = computed(() => ICONS[this.tone()]);
}
