import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconComponent } from '../icon/icon.component';
import type { IconName } from '../icon/icon-set';

export type BannerTone = 'info' | 'warning' | 'error';

/**
 * A notice about the application itself rather than the page under it — a new
 * version, a word source that needs attention. Its ground spans the window
 * above the page's bar, but its content sits in the page column, so the
 * sentence starts where the page's title does and the actions end where the
 * page's cards end.
 *
 *   <mn-banner tone="info" icon="info" role="status">
 *     <p>A new version of Monosai is ready.</p>
 *     <button mn-banner-action mnButton="primary" type="button">Reload to update</button>
 *     <button mn-banner-action mnButton="ghost" type="button">Later</button>
 *   </mn-banner>
 *
 * The words take the row and the actions sit at its end as one block; when the
 * column cannot hold both, the actions move to a line of their own, still at
 * the end, so a phone spends two short lines on it rather than a stack.
 */
@Component({
  selector: 'mn-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  host: {
    'animate.leave': 'is-leaving',
    '[class.banner--warning]': "tone() === 'warning'",
    '[class.banner--error]': "tone() === 'error'",
  },
  template: `
    <div class="column">
      @if (icon(); as name) {
        <mn-icon class="mn-lead" [name]="name" [size]="18" />
      }
      <div class="words"><ng-content /></div>
      <div class="actions mn-trailing"><ng-content select="[mn-banner-action]" /></div>
    </div>
  `,
  styles: `
    @use '../../../styles/motion' as motion;

    /*
     * It opens its own row at the top of the window, so the page below moves
     * once, smoothly, rather than jumping; leaving, it closes the row again.
     */
    :host {
      --banner-soft: var(--action-primary-soft);
      --banner-ink: var(--text-primary);

      display: block;
      @include motion.reveal;
      padding-inline: var(--page-gutter);
      border-bottom: 1px solid var(--border-subtle);
      background: var(--banner-soft);
      color: var(--banner-ink);
      font-size: var(--text-sm);
      line-height: var(--leading-snug);
    }

    :host(.is-leaving) {
      @include motion.conceal;
    }

    :host(.banner--warning) {
      --banner-soft: var(--status-warning-soft);
    }

    :host(.banner--error) {
      --banner-soft: var(--status-danger-soft);
      --banner-ink: var(--status-danger);
    }

    .column {
      display: flex;
      flex-wrap: wrap;
      gap: 0 var(--space-3);
      align-items: center;
      max-width: var(--page-measure);
      margin-inline: auto;
      padding-block: var(--space-1);
    }

    /* On the words' first line, wherever the row wraps. */
    .column > mn-icon {
      margin-block: var(--space-2);
    }

    .words {
      display: flex;
      flex: 1 1 16rem;
      flex-direction: column;
      gap: var(--space-1);
      min-width: 0;
      padding-block: var(--space-2);
    }

    .actions {
      display: flex;
      flex: none;
      flex-wrap: wrap;
      gap: var(--space-2);
      align-items: center;
      margin-inline-start: auto;
    }

    .actions:empty {
      display: none;
    }
  `,
})
export class BannerComponent {
  readonly tone = input<BannerTone>('info');
  readonly icon = input<IconName | null>(null);
}
