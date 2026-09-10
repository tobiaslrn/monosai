import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { GenerationState } from '../../application/generation/generation.store';

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
        title: 'Preparing your vocabulary',
        detail: '',
      };
    case 'writing':
      return {
        key: state.kind,
        title: 'Generating your story',
        detail: '',
      };
    case 'parsing':
      return {
        key: state.kind,
        title: 'Reading the generated Japanese',
        detail: '',
      };
    case 'validating':
      return {
        key: state.kind,
        title: 'Checking the vocabulary',
        detail: '',
      };
    case 'exception-review': {
      const count = state.candidateCount;
      return {
        key: `${state.kind}-${String(count)}`,
        title: `Reviewing ${String(count)} unfamiliar ${count === 1 ? 'word' : 'words'}`,
        detail: '',
      };
    }
    case 'repairing': {
      const count = state.unknownCount;
      const title =
        count > 0
          ? `Replacing ${String(count)} unfamiliar ${count === 1 ? 'word' : 'words'}${state.structureIssueCount > 0 ? ' and fixing the structure' : ''}`
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
        title: 'Saving your story',
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
  template: `
    @for (message of [copy()]; track message.key) {
      <div class="copy" data-testid="generation-copy">
        <h2>
          <span class="status-title">{{ message.title }}</span
          ><span class="loading-dots" aria-hidden="true"
            ><span class="loading-dots__reveal">...</span></span
          >
        </h2>
        @if (message.detail) {
          <p>{{ message.detail }}</p>
        }
      </div>
    }
  `,
  styleUrl: './generation-wait.component.scss',
})
export class GenerationWaitComponent {
  /**
   * The run to describe, passed in rather than injected: several generations
   * can be in flight, so the screen has to say which one it is showing.
   */
  readonly state = input.required<GenerationState>();

  protected readonly copy = computed(() => generationWaitCopy(this.state()));
}
