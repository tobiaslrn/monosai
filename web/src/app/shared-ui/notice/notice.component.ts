import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IconComponent } from '../icon/icon.component';
import type { IconName } from '../icon/icon-set';
import type { StatusTone } from '../tone';

/** Any status tone, or `neutral` for a fact that carries none. */
export type NoticeTone = 'neutral' | StatusTone;

/**
 * Something reported beside the thing it is about: a failure, a warning, a
 * result, or a fact needed before acting. The words take the row and an
 * optional action, or a pair of them, sits at its end as one block, moving
 * below the words only when they need the room.
 *
 *   <mn-notice tone="danger" icon="warning" role="alert">
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
    '[class.mn-notice--setup]': "tone() === 'setup'",
    '[class.mn-notice--success]': "tone() === 'success'",
    '[class.mn-notice--warning]': "tone() === 'warning'",
    '[class.mn-notice--danger]': "tone() === 'danger'",
  },
  template: `
    @if (glyph(); as name) {
      <mn-icon [name]="name" [legacySize]="18" />
    }
    <div><ng-content /></div>
    <span class="mn-notice__actions"><ng-content select="[mn-notice-action]" /></span>
  `,
})
export class NoticeComponent {
  readonly tone = input<NoticeTone>('neutral');
  /**
   * The leading glyph. Left out, the tone brings its own, so every notice that
   * reports a status leads with the same mark for it; `none` leaves a fact bare.
   */
  readonly icon = input<IconName | 'none' | null>(null);

  protected readonly glyph = computed<IconName | null>(() => {
    const icon = this.icon();
    if (icon === 'none') {
      return null;
    }
    return icon ?? TONE_GLYPH[this.tone()];
  });
}

/** One mark per tone, app-wide: a failure and a warning, a result, a fact to know. */
const TONE_GLYPH: Readonly<Record<NoticeTone, IconName | null>> = {
  neutral: null,
  info: 'info',
  setup: 'warning',
  success: 'synced',
  warning: 'warning',
  danger: 'warning',
};
