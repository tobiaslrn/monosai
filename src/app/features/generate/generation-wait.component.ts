import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import {
  GenerationStore,
  type GenerationState,
} from '../../application/generation/generation.store';

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
        detail: 'Making sure the model, vocabulary, and grammar profile are ready.',
      };
    case 'preparing':
      return {
        key: state.kind,
        title: 'Preparing your vocabulary',
        detail: 'Collecting the reviewed words this story may use.',
      };
    case 'writing':
      return {
        key: state.kind,
        title: 'Generating your story',
        detail: 'The model is writing the Japanese. This is usually the longest step.',
      };
    case 'parsing':
      return {
        key: state.kind,
        title: 'Reading the generated Japanese',
        detail: 'Breaking the story into words so it can be checked locally.',
      };
    case 'validating':
      return {
        key: state.kind,
        title: 'Checking the vocabulary',
        detail: 'Comparing every word with your reviewed vocabulary.',
      };
    case 'exception-review': {
      const count = state.candidateCount;
      return {
        key: `${state.kind}-${String(count)}`,
        title: `Reviewing ${String(count)} unfamiliar ${count === 1 ? 'word' : 'words'}`,
        detail: 'Checking whether your exception policy allows them.',
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
        detail: `Repair attempt ${String(state.attempt)} of 2. The revised story will be checked again.`,
      };
    }
    case 'auxiliary-review':
      return {
        key: state.kind,
        title: 'Reviewing grammar and translating',
        detail: 'These two finishing checks are running at the same time.',
      };
    case 'finalizing':
      return {
        key: state.kind,
        title: 'Saving your story',
        detail: 'Adding the Japanese and available reading aids to your library.',
      };
    case 'saved':
      return {
        key: state.kind,
        title: 'Your story is ready',
        detail: `Saved “${state.reading.title}”.`,
      };
    case 'cancelled':
      return { key: state.kind, title: 'Generation stopped', detail: 'Nothing was saved.' };
    case 'invalid-draft':
      return {
        key: state.kind,
        title: 'The story still needs work',
        detail: 'It could not be made valid after two repair attempts.',
      };
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
        <p class="eyebrow">Creating your reading</p>
        <h2>
          <span class="status-title">{{ message.title }}</span
          ><span class="loading-dots" aria-hidden="true"
            ><span class="loading-dots__reveal">...</span></span
          >
        </h2>
        <p>{{ message.detail }}</p>
      </div>
    }
  `,
  styleUrl: './generation-wait.component.scss',
})
export class GenerationWaitComponent {
  private readonly generation = inject(GenerationStore);

  protected readonly copy = computed(() => generationWaitCopy(this.generation.state()));
}
