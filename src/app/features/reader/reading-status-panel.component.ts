import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { TranslationJobProgress } from '../../application/enrichment/translation-job.store';
import type { Reading } from '../../domain/reading/reading';
import { aiErrorCopy, aiTaskCopy } from '../../shared-ui/ai-error/ai-error-copy';
import {
  completionLabel,
  grammarLabel,
} from '../../shared-ui/reading-summary/reading-summary-labels';

/**
 * Whole-reading aid state, and the one place a whole-reading job is started,
 * cancelled, and retried.
 *
 * Every count here comes from the reading's stored summaries, which are
 * refreshed inside the same transaction as each write — so the panel reports
 * what is actually saved rather than what a run believes it did. While a job is
 * running its live counts take over, because a summary refreshed per sentence
 * would lag the sentence in flight.
 */
@Component({
  selector: 'mn-reading-status-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panel" aria-labelledby="mn-reading-status-heading">
      <h2 id="mn-reading-status-heading" class="mn-visually-hidden">Reading status</h2>

      <p class="line">
        <span>{{ translationLine() }}</span>
        <span class="grammar">{{ grammarLine() }}</span>
      </p>

      <p class="progress" role="status">{{ jobLine() }}</p>

      <div class="actions">
        @if (isRunning()) {
          <button type="button" class="mn-button" (click)="cancelled.emit()">Cancel</button>
        } @else if (hasFailure()) {
          <button type="button" class="mn-button" (click)="retried.emit()">Retry the rest</button>
        } @else if (missingCount() > 0) {
          <button type="button" class="mn-button" (click)="started.emit()">
            Translate whole reading
          </button>
        }
      </div>

      @if (failureLine(); as failure) {
        <p class="mn-error" role="alert">{{ failure }}</p>
      }
    </section>
  `,
  styles: `
    .panel {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2) var(--space-4);
      align-items: center;
      max-width: var(--reader-measure);
      margin-bottom: var(--space-4);
      padding: var(--space-3);
      border-radius: var(--radius-control);
      background: var(--surface-sunken);
      font-size: var(--text-sm);
    }

    .line {
      display: flex;
      flex: 1;
      flex-wrap: wrap;
      gap: var(--space-1) var(--space-4);
      margin: 0;
      min-width: 12rem;
    }

    .grammar,
    .progress {
      color: var(--text-secondary);
    }

    .progress {
      margin: 0;
    }

    .actions {
      display: flex;
      gap: var(--space-2);
    }

    .mn-error {
      flex-basis: 100%;
      margin: 0;
      color: var(--status-danger);
    }
  `,
})
export class ReadingStatusPanelComponent {
  readonly reading = input.required<Reading>();
  readonly progress = input.required<TranslationJobProgress>();

  readonly started = output<void>();
  readonly cancelled = output<void>();
  readonly retried = output<void>();

  protected readonly translationLine = computed(() =>
    completionLabel('Translations', this.reading().translationSummary),
  );

  protected readonly grammarLine = computed(() => grammarLabel(this.reading().grammarSummary));

  protected readonly isRunning = computed(() => {
    const kind = this.progress().kind;
    return kind === 'preparing' || kind === 'running';
  });

  protected readonly hasFailure = computed(() => {
    const progress = this.progress();
    return (progress.kind === 'failed' || progress.kind === 'cancelled') && this.missingCount() > 0;
  });

  /** Sentences with no current translation, from the stored summary. */
  protected readonly missingCount = computed(() => {
    const summary = this.reading().translationSummary;
    return Math.max(summary.total - summary.completed, 0);
  });

  protected readonly jobLine = computed(() => {
    const progress = this.progress();
    switch (progress.kind) {
      case 'idle':
        return this.missingCount() === 0
          ? 'Every sentence is translated.'
          : `${String(this.missingCount())} sentences have no translation yet.`;
      case 'preparing':
        return 'Preparing…';
      case 'running':
        return `Translating ${String(progress.counts.completed + 1)} of ${String(progress.counts.requested)}…`;
      case 'complete':
        return 'Translation finished.';
      case 'cancelled':
        return 'Stopped. Sentences already translated were kept.';
      case 'failed':
        return `Stopped after ${String(progress.counts.completed)} of ${String(progress.counts.requested)}. Nothing already translated was lost.`;
    }
  });

  protected readonly failureLine = computed(() => {
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
