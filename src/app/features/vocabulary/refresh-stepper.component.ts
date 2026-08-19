import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import {
  VocabularyRefreshStore,
  type RefreshState,
} from '../../application/vocabulary/vocabulary-refresh.store';

/** The stages a learner sees, in the order the workflow passes through them. */
const STAGES = [
  { key: 'connecting', label: 'Connecting' },
  { key: 'reading', label: 'Reading reviewed cards' },
  { key: 'analyzing', label: 'Analyzing vocabulary' },
  { key: 'confirming', label: 'Ready to confirm' },
] as const;

type StageKey = (typeof STAGES)[number]['key'];

/** Which stage a state belongs to; `null` for states outside a run. */
function stageOf(state: RefreshState): StageKey | null {
  switch (state.kind) {
    case 'probing':
    case 'discovering':
    case 'validating':
      return 'connecting';
    case 'querying':
    case 'extracting':
      return 'reading';
    case 'analyzing':
    case 'summarizing':
      return 'analyzing';
    case 'awaiting-confirmation':
    case 'committing':
    case 'complete':
      return 'confirming';
    case 'idle':
    case 'cancelled':
    case 'failed':
      return null;
  }
}

/**
 * Progress through a refresh.
 *
 * The current stage is announced with its counts as text rather than only as a
 * bar, because a progress indicator with no numbers tells a screen reader
 * nothing about how far along a long extraction is.
 */
@Component({
  selector: 'mn-refresh-stepper',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ol class="stages">
      @for (stage of stages; track stage.key) {
        <li
          class="stage"
          [class.is-current]="stage.key === currentStage()"
          [class.is-done]="isDone(stage.key)"
          [attr.aria-current]="stage.key === currentStage() ? 'step' : null"
        >
          {{ stage.label }}
        </li>
      }
    </ol>

    <p class="detail" data-testid="refresh-detail">{{ detail() }}</p>
  `,
  styles: `
    .stages {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      margin: 0 0 var(--space-2);
      padding: 0;
      list-style: none;
      counter-reset: stage;
    }

    .stage {
      counter-increment: stage;
      font-size: var(--text-sm);
      color: var(--text-secondary);
    }

    .stage::before {
      content: counter(stage) '. ';
    }

    .stage.is-done {
      color: var(--status-success);
    }

    .stage.is-current {
      color: var(--text-primary);
      font-weight: 600;
    }

    .detail {
      margin: 0;
      font-size: var(--text-sm);
      color: var(--text-secondary);
    }
  `,
})
export class RefreshStepperComponent {
  protected readonly refresh = inject(VocabularyRefreshStore);
  protected readonly stages = STAGES;

  protected readonly currentStage = computed(() => stageOf(this.refresh.state()));

  /** One sentence carrying the counts the stage actually knows. */
  protected readonly detail = computed(() => {
    const state = this.refresh.state();
    switch (state.kind) {
      case 'probing':
        return 'Testing the connection…';
      case 'discovering':
        return 'Reading your decks and note types…';
      case 'validating':
        return 'Checking your sources…';
      case 'querying':
        return `Searching source ${String(state.mappingsDone + 1)} of ${String(state.mappingsTotal)}…`;
      case 'extracting':
        return state.total === null
          ? `Examined ${String(state.examined)} cards…`
          : `Examined ${String(state.examined)} of ${String(state.total)} cards…`;
      case 'analyzing':
        return `Analyzed ${String(state.completed)} of ${String(state.total)} expressions…`;
      case 'summarizing':
        return 'Preparing the summary…';
      case 'awaiting-confirmation':
        return `Found ${String(state.summary.stats.uniqueExpressions)} unique expressions.`;
      case 'committing':
        return 'Saving the snapshot. This cannot be cancelled.';
      case 'complete':
        return `Saved ${String(state.snapshot.uniqueEntryCount)} unique expressions.`;
      case 'cancelled':
        return 'Cancelled. Nothing was saved.';
      case 'idle':
      case 'failed':
        return '';
    }
  });

  protected isDone(stage: StageKey): boolean {
    const current = this.currentStage();
    if (current === null) {
      return false;
    }
    const order = STAGES.map((entry) => entry.key);
    return order.indexOf(stage) < order.indexOf(current);
  }
}
