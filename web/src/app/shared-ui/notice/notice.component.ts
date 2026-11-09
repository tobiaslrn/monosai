import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconComponent } from '../icon/icon.component';
import type { IconName } from '../icon/icon-set';

export type NoticeTone = 'neutral' | 'info' | 'success' | 'warning' | 'error';

/**
 * Something reported beside the thing it is about: a failure, a warning, a
 * result, or a fact needed before acting. The words take the row and an
 * optional action, or a pair of them, sits at its end as one block, moving
 * below the words only when they need the room.
 *
 *   <mn-notice tone="error" icon="warning" role="alert">
 *     <p>What happened.</p>
 *     <button mn-notice-action mnButton type="button">Retry</button>
 *   </mn-notice>
 *
 * The look is the shared `.mn-notice` role (`styles/components/_notice.scss`).
 */
@Component({
  selector: 'mn-notice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  host: {
    class: 'mn-notice',
    '[class.mn-notice--info]': "tone() === 'info'",
    '[class.mn-notice--success]': "tone() === 'success'",
    '[class.mn-notice--warning]': "tone() === 'warning'",
    '[class.mn-notice--error]': "tone() === 'error'",
  },
  template: `
    @if (icon(); as name) {
      <mn-icon [name]="name" [size]="18" />
    }
    <div><ng-content /></div>
    <span class="mn-notice__actions"><ng-content select="[mn-notice-action]" /></span>
  `,
})
export class NoticeComponent {
  readonly tone = input<NoticeTone>('neutral');
  readonly icon = input<IconName | null>(null);
}
