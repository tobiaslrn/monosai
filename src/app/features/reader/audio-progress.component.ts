import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { AudioJobProgress } from '../../application/enrichment/audio-job.store';
import { aiErrorCopy, aiTaskCopy } from '../../shared-ui/ai-error/ai-error-copy';

/**
 * The whole-reading audio job, while it is happening and no longer.
 *
 * The same hairline as translation, deliberately: a learner who has watched one
 * whole-reading job should not have to learn a second surface for the next one.
 * The wording differs where the behaviour does — audio stops at the sentence
 * that failed rather than carrying on past it, so its Retry says it resumes
 * there rather than offering "the rest".
 */
@Component({
  selector: 'mn-audio-progress',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      <div class="job">
        <div
          class="bar"
          role="progressbar"
          aria-label="Preparing audio for this reading"
          [attr.aria-valuenow]="percent()"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <span class="fill" [style.inline-size.%]="percent()"></span>
        </div>

        <div class="row">
          <p class="line" role="status">{{ line() }}</p>
          @if (isRunning()) {
            <button type="button" class="quiet" (click)="cancelled.emit()">Stop</button>
          } @else if (canRetry()) {
            <button type="button" class="quiet" (click)="retried.emit()">Retry</button>
          }
          <button type="button" class="quiet" (click)="dismissed.emit()">Dismiss</button>
        </div>

        @if (failure(); as failure) {
          <p class="mn-error" role="alert">{{ failure }}</p>
        }
      </div>
    }
  `,
  styles: `
    .job {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
      padding-block: var(--space-2);
    }

    .bar {
      block-size: 3px;
      overflow: hidden;
      border-radius: var(--radius-pill);
      background: var(--surface-sunken);
    }

    .fill {
      display: block;
      block-size: 100%;
      background: var(--action-primary);
      transition: inline-size var(--motion-medium) ease-out;
    }

    .row {
      display: flex;
      gap: var(--space-3);
      align-items: center;
    }

    .line {
      flex: 1;
      margin: 0;
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    .quiet {
      min-height: var(--touch-target);
      padding-inline: var(--space-2);
      border: 0;
      background: none;
      color: var(--text-primary);
      font: inherit;
      font-size: var(--text-sm);
      text-decoration: underline;
      cursor: pointer;
    }

    .mn-error {
      margin: 0;
      color: var(--status-danger);
      font-size: var(--text-sm);
    }

    @media (prefers-reduced-motion: reduce) {
      .fill {
        transition: none;
      }
    }
  `,
})
export class AudioProgressComponent {
  readonly progress = input.required<AudioJobProgress>();

  readonly cancelled = output<void>();
  readonly retried = output<void>();
  readonly dismissed = output<void>();

  protected readonly visible = computed(() => this.progress().kind !== 'idle');

  protected readonly isRunning = computed(() => {
    const kind = this.progress().kind;
    return kind === 'preparing' || kind === 'running';
  });

  /** Only offered when clips are actually still missing. */
  protected readonly canRetry = computed(() => {
    const progress = this.progress();
    if (progress.kind !== 'failed' && progress.kind !== 'cancelled') {
      return false;
    }
    return progress.counts.completed < progress.counts.requested;
  });

  protected readonly percent = computed(() => {
    const progress = this.progress();
    if (progress.kind === 'idle' || progress.kind === 'preparing') {
      return 0;
    }
    const { completed, requested } = progress.counts;
    return requested === 0 ? 100 : Math.round((completed / requested) * 100);
  });

  protected readonly line = computed(() => {
    const progress = this.progress();
    switch (progress.kind) {
      case 'idle':
        return '';
      case 'preparing':
        return 'Preparing…';
      case 'running':
        return `Reading ${String(progress.counts.completed + 1)} of ${String(progress.counts.requested)}…`;
      case 'complete':
        return 'Audio is ready for the whole reading.';
      case 'cancelled':
        return 'Stopped. Sentences already read aloud were kept.';
      case 'failed':
        // Audio stops at the sentence that failed, so the number completed is
        // also where a retry picks up — which is worth saying plainly, because
        // the whole-reading player stays shut until the set is finished.
        return `Stopped at sentence ${String(progress.counts.completed + 1)} of ${String(progress.counts.requested)}. Earlier clips were kept.`;
    }
  });

  protected readonly failure = computed(() => {
    const progress = this.progress();
    if (progress.kind !== 'failed') {
      return null;
    }
    if (progress.error.source === 'storage') {
      return `Saving failed: ${progress.error.error.message}`;
    }
    const copy = aiErrorCopy(progress.error.error);
    return `${copy.heading} while ${aiTaskCopy(progress.error.error.task)}. ${copy.primaryAction}`;
  });
}
