import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { GenerationState } from '../../application/generation/generation-state';
import { WorkingComponent } from '../../shared-ui/working/working.component';

interface WaitCopy {
  readonly key: string;
  readonly title: string;
  readonly detail: string;
}

/** Human wording for each real state of the generation job. */
export function generationWaitCopy(state: GenerationState): WaitCopy {
  switch (state.kind) {
    case 'checking-prerequisites':
      return {
        key: state.kind,
        title: 'Checking your setup',
        detail: '',
      };
    case 'preparing':
      return {
        key: state.kind,
        title: 'Preparing words',
        detail: '',
      };
    case 'writing':
      return {
        key: state.kind,
        title: 'Writing the story',
        detail: '',
      };
    case 'parsing':
      return {
        key: state.kind,
        title: 'Reading the Japanese',
        detail: '',
      };
    case 'validating':
      return {
        key: state.kind,
        title: 'Checking words',
        detail: '',
      };
    case 'exception-review': {
      const count = state.candidateCount;
      return {
        key: `${state.kind}-${String(count)}`,
        title: `Checking ${String(count)} new ${count === 1 ? 'word' : 'words'}`,
        detail: '',
      };
    }
    case 'repairing': {
      const count = state.unknownCount;
      const title =
        count > 0
          ? `Replacing ${String(count)} new ${count === 1 ? 'word' : 'words'}`
          : 'Fixing the story structure';
      return {
        key: `${state.kind}-${String(state.attempt)}`,
        title,
        detail: `Repair ${String(state.attempt)} of ${String(state.totalAttempts)}`,
      };
    }
    case 'finalizing':
      return {
        key: state.kind,
        title: 'Saving',
        detail: '',
      };
    case 'saved':
      return {
        key: state.kind,
        title: 'Your story is ready',
        detail: '',
      };
    case 'cancelled':
      return { key: state.kind, title: 'Generation stopped', detail: 'Nothing was saved.' };
    case 'failed':
      return { key: state.kind, title: 'Generation stopped', detail: state.error.message };
    case 'idle':
      return { key: state.kind, title: 'Ready to generate', detail: '' };
  }
}

@Component({
  selector: 'mn-generation-wait',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [WorkingComponent],
  template: `
    @for (message of [copy()]; track message.key) {
      <mn-working
        data-testid="generation-copy"
        [heading]="message.title"
        [detail]="message.detail"
      />
    }
  `,
})
export class GenerationWaitComponent {
  /**
   * The run to describe, passed in rather than injected: several generations
   * can be in flight, so the screen has to say which one it is showing.
   */
  readonly state = input.required<GenerationState>();

  protected readonly copy = computed(() => generationWaitCopy(this.state()));
}
