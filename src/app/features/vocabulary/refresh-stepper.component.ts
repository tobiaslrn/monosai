import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import {
  VocabularyRefreshStore,
  type RefreshState,
} from '../../application/vocabulary/vocabulary-refresh.store';
import {
  StepperComponent,
  type StepStatus,
  type StepperStep,
} from '../../shared-ui/stepper/stepper.component';

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
 * The stage mapping lives here and the shell comes from `mn-stepper`: the two
 * long workflows in the app share a state vocabulary, not a state machine.
 * Counts are announced as text rather than only as a bar, because a progress
 * indicator with no numbers tells a screen reader nothing about how far along a
 * long extraction is.
 */
@Component({
  selector: 'mn-refresh-stepper',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StepperComponent],
  template: `
    <mn-stepper [steps]="steps()" label="Vocabulary refresh progress" />
    <p class="detail" data-testid="refresh-detail">{{ detail() }}</p>
  `,
  styles: `
    .detail {
      margin: var(--space-3) 0 0;
      font-size: var(--text-sm);
      color: var(--text-secondary);
    }
  `,
})
export class RefreshStepperComponent {
  protected readonly refresh = inject(VocabularyRefreshStore);

  private readonly currentStage = computed(() => stageOf(this.refresh.state()));

  protected readonly steps = computed<readonly StepperStep[]>(() => {
    const state = this.refresh.state();
    const current = this.currentStage();
    const order = STAGES.map((stage) => stage.key);
    const currentIndex = current === null ? -1 : order.indexOf(current);

    return STAGES.map((stage, index) => ({
      key: stage.key,
      label: stage.label,
      status: statusFor(state, index, currentIndex),
    }));
  });

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
}

function statusFor(state: RefreshState, index: number, currentIndex: number): StepStatus {
  if (currentIndex === -1) {
    return state.kind === 'failed' ? 'failed' : 'pending';
  }
  if (index < currentIndex) {
    return 'complete';
  }
  if (index > currentIndex) {
    return 'pending';
  }
  return state.kind === 'complete' ? 'complete' : 'active';
}
