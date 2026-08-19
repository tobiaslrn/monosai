import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import {
  GenerationStore,
  type GenerationState,
} from '../../application/generation/generation.store';
import {
  StepperComponent,
  type StepStatus,
  type StepperStep,
} from '../../shared-ui/stepper/stepper.component';

/** The nine stages the specification names, in workflow order. */
const STAGES = [
  { key: 'preparing', label: 'Preparing vocabulary' },
  { key: 'writing', label: 'Writing Japanese' },
  { key: 'parsing', label: 'Parsing' },
  { key: 'validating', label: 'Validating vocabulary' },
  { key: 'exception-review', label: 'Reviewing exceptions' },
  { key: 'repairing', label: 'Repairing' },
  { key: 'grammar', label: 'Reviewing grammar' },
  { key: 'translating', label: 'Translating' },
  { key: 'saving', label: 'Saving' },
] as const;

type StageKey = (typeof STAGES)[number]['key'];

const ORDER: readonly StageKey[] = STAGES.map((stage) => stage.key);

/** The stage a state is currently in, or `null` outside a run. */
function stageOf(state: GenerationState): StageKey | null {
  // A failure names the stage it interrupted, so the display can mark it.
  const kind = state.kind === 'failed' ? state.during : state.kind;
  switch (kind) {
    case 'checking-prerequisites':
    case 'preparing':
      return 'preparing';
    case 'writing':
      return 'writing';
    case 'parsing':
      return 'parsing';
    case 'validating':
      return 'validating';
    case 'exception-review':
      return 'exception-review';
    case 'repairing':
      return 'repairing';
    case 'finalizing':
    case 'saved':
      return 'saving';
    case 'idle':
    case 'invalid-draft':
    case 'cancelled':
      return null;
  }
}

/**
 * Progress through one generation.
 *
 * Grammar review and translation are shown as Skipped rather than hidden:
 * Milestone 8 fills those stages in, and a stepper that silently omits them
 * would misrepresent what a saved story currently has. Optional stages that a
 * run genuinely did not need — the exception review with no policy, a repair
 * that never happened — are Skipped for the same reason.
 */
@Component({
  selector: 'mn-generation-stepper',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StepperComponent],
  template: `
    <mn-stepper [steps]="steps()" label="Generation progress" />
    <p class="detail" data-testid="generation-detail">{{ detail() }}</p>
  `,
  styles: `
    .detail {
      margin: var(--space-3) 0 0;
      font-size: var(--text-sm);
      color: var(--text-secondary);
    }
  `,
})
export class GenerationStepperComponent {
  private readonly generation = inject(GenerationStore);

  protected readonly steps = computed<readonly StepperStep[]>(() => {
    const state = this.generation.state();
    const current = stageOf(state);
    const currentIndex = current === null ? -1 : ORDER.indexOf(current);
    const repairs = this.generation.repairAttempts();
    const reviews = this.generation.exceptionReviews();

    return STAGES.map((stage, index) => ({
      key: stage.key,
      label: stage.label,
      status: this.statusFor(stage.key, index, currentIndex, state, repairs, reviews),
      ...(stage.key === 'repairing' && repairs > 0
        ? { detail: `attempt ${String(repairs)} of 2` }
        : {}),
    }));
  });

  protected readonly detail = computed(() => {
    const state = this.generation.state();
    switch (state.kind) {
      case 'checking-prerequisites':
        return 'Checking what this story needs…';
      case 'preparing':
        return 'Reading your reviewed vocabulary…';
      case 'writing':
        return 'The model is writing Japanese. This is the slowest step.';
      case 'parsing':
        return 'Reading the story back…';
      case 'validating':
        return 'Checking every word against your vocabulary…';
      case 'exception-review':
        return `Asking your exception policy about ${String(state.candidateCount)} unfamiliar ${
          state.candidateCount === 1 ? 'word' : 'words'
        }…`;
      case 'repairing':
        return `Repairing the story (attempt ${String(state.attempt)} of 2)…`;
      case 'finalizing':
        return 'Saving the story. This cannot be cancelled.';
      case 'saved':
        return `Saved “${state.reading.title}”.`;
      case 'invalid-draft':
        return 'This story was not saved.';
      case 'cancelled':
        return 'Cancelled. Nothing was saved.';
      case 'idle':
      case 'failed':
        return '';
    }
  });

  /**
   * A stage's status, given where the run currently is.
   *
   * The loop can revisit earlier stages after a repair, so "before the current
   * stage" means complete only for stages the run must have passed through;
   * the optional ones report Skipped when the run reached the end without them.
   */
  private statusFor(
    key: StageKey,
    index: number,
    currentIndex: number,
    state: GenerationState,
    repairs: number,
    reviews: number,
  ): StepStatus {
    // Milestone 7 saves with empty auxiliary summaries; Milestone 8 runs these.
    if (key === 'grammar' || key === 'translating') {
      return 'skipped';
    }
    if (state.kind === 'failed') {
      return index === currentIndex ? 'failed' : index < currentIndex ? 'complete' : 'pending';
    }
    if (key === 'repairing') {
      if (state.kind === 'repairing') {
        return 'retrying';
      }
      return repairs > 0 ? 'complete' : currentIndex === -1 ? 'pending' : 'skipped';
    }
    if (key === 'exception-review' && state.kind !== 'exception-review') {
      if (reviews > 0) {
        return 'complete';
      }
      return currentIndex === -1 ? 'pending' : 'skipped';
    }
    if (currentIndex === -1) {
      return 'pending';
    }
    if (index < currentIndex) {
      return 'complete';
    }
    if (index > currentIndex) {
      return 'pending';
    }
    return state.kind === 'saved' ? 'complete' : 'active';
  }
}
