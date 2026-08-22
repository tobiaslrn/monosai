import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import {
  GenerationStore,
  type BranchState,
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

/**
 * How a finished auxiliary branch reads.
 *
 * An unavailable review is reported as failed rather than skipped: the run did
 * ask for it and did not get one, which is a different thing from a stage the
 * run never needed. Neither outcome stops the story from being saved.
 */
function branchStatus(branch: BranchState): StepStatus {
  switch (branch.status) {
    case 'running':
      return 'active';
    case 'complete':
      return 'complete';
    case 'partial':
      return 'failed';
    case 'unavailable':
      return 'failed';
  }
}

function branchDetail(key: StageKey, branch: BranchState): string | undefined {
  if (branch.status === 'unavailable') {
    return 'unavailable';
  }
  if (branch.status === 'partial' && key === 'translating') {
    return `${String(branch.completed)} of ${String(branch.total)} translated`;
  }
  return undefined;
}

const ORDER: readonly StageKey[] = STAGES.map((stage) => stage.key);

/** The stage a state is currently in, or `null` outside a run. */
function stageOf(state: GenerationState): StageKey | null {
  // A failure or a cancellation names the stage it interrupted, so the display
  // can mark where the run actually stopped instead of showing nothing at all.
  const kind = state.kind === 'failed' || state.kind === 'cancelled' ? state.during : state.kind;
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
    case 'auxiliary-review':
      // Grammar and translation run concurrently under one state; the earlier
      // stage row stands in for "current" so the other stages' complete/pending
      // logic still has a single index to compare against. The grammar and
      // translating rows compute their own status from `state.grammar` /
      // `state.translation` directly, not from this index.
      return 'grammar';
    case 'finalizing':
    case 'saved':
      return 'saving';
    case 'idle':
    case 'invalid-draft':
      return null;
  }
}

/**
 * Progress through one generation.
 *
 * Grammar review and translation run concurrently once the Japanese is
 * accepted, and their rows reflect real progress: each becomes Active while
 * its branch is running and Complete once the run reaches `finalizing` or
 * `saved`, whatever the other branch's outcome was. Optional stages that a run
 * genuinely did not need — the exception review with no policy, a repair that
 * never happened — are Skipped for the same reason as before.
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
    const auxiliary = this.generation.auxiliary();

    return STAGES.map((stage, index) => {
      const branch =
        stage.key === 'grammar'
          ? auxiliary?.grammar
          : stage.key === 'translating'
            ? auxiliary?.translation
            : undefined;
      const detail = branch === undefined ? undefined : branchDetail(stage.key, branch);
      return {
        key: stage.key,
        label: stage.label,
        status: this.statusFor(stage.key, index, currentIndex, state, repairs, reviews),
        ...(stage.key === 'repairing' && repairs > 0
          ? { detail: `attempt ${String(repairs)} of 2` }
          : {}),
        ...(detail === undefined ? {} : { detail }),
      };
    });
  });

  protected readonly detail = computed(() => {
    const state = this.generation.state();
    switch (state.kind) {
      case 'checking-prerequisites':
        return 'Checking what this story needs…';
      case 'preparing':
        return 'Reading your reviewed vocabulary…';
      case 'writing':
        return 'Writing your story. This is the slowest step.';
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
      case 'auxiliary-review':
        return 'Reviewing grammar and translating…';
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
    if (key === 'grammar' || key === 'translating') {
      if (state.kind === 'auxiliary-review') {
        const branch = key === 'grammar' ? state.grammar : state.translation;
        return branch.status === 'running' ? 'active' : branchStatus(branch);
      }
      if (state.kind === 'finalizing' || state.kind === 'saved') {
        const outcome = this.generation.auxiliary();
        const branch = key === 'grammar' ? outcome?.grammar : outcome?.translation;
        return branch === undefined ? 'complete' : branchStatus(branch);
      }
      // An invalid draft never reached acceptance, so grammar and translation
      // never ran — reporting them Complete here would claim work that never
      // happened, unlike the stages the draft actually passed through.
      if (state.kind === 'invalid-draft') {
        return 'skipped';
      }
    }
    // An unsaved draft ran everything except the save, so the stages it passed
    // report done rather than never started.
    if (state.kind === 'invalid-draft') {
      if (key === 'saving') {
        return 'skipped';
      }
      if (key === 'repairing') {
        return repairs > 0 ? 'complete' : 'skipped';
      }
      if (key === 'exception-review') {
        return reviews > 0 ? 'complete' : 'skipped';
      }
      return 'complete';
    }
    if (state.kind === 'cancelled') {
      if (index < currentIndex) {
        return 'complete';
      }
      return index === currentIndex ? 'skipped' : 'pending';
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
