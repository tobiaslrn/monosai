import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import {
  ExceptionPolicyStore,
  MAX_POLICY_LENGTH,
} from '../../application/settings/exception-policy.store';
import { TextModelStore } from '../../application/settings/text-model.store';

/**
 * The single global exception policy.
 *
 * It only ever applies while a story is being generated, and each story keeps
 * the wording that was in force when it was made: editing this changes what
 * future stories are judged against and never rewrites an existing one.
 */
@Component({
  selector: 'mn-generation-policy-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mn-panel" aria-labelledby="mn-policy-heading">
      <h2 id="mn-policy-heading">Generation policy</h2>
      <p class="mn-hint">
        Words outside your vocabulary are normally rejected. This policy describes the exceptions
        you are willing to accept — proper nouns, for example. Approved exceptions stay visibly
        marked in the reader and never count as words you know.
      </p>

      <div class="mn-field">
        <label for="mn-policy-text">Exception policy</label>
        <textarea
          id="mn-policy-text"
          rows="4"
          data-testid="policy-input"
          [attr.aria-describedby]="policy.isTooLong() ? 'mn-policy-error' : 'mn-policy-count'"
          [value]="policy.draft()"
          (input)="onInput($event)"
        ></textarea>
        <p id="mn-policy-count" class="mn-hint">{{ countLabel() }}</p>
      </div>

      <div class="mn-field token-budget">
        <label for="mn-story-token-budget">Story token budget</label>
        <div class="budget-row">
          <input
            id="mn-story-token-budget"
            class="mn-control"
            type="number"
            min="4096"
            max="32768"
            step="1"
            data-testid="story-token-budget-input"
            [value]="text.storyTokenBudgetDraft()"
            [attr.aria-invalid]="!text.isStoryTokenBudgetValid()"
            (input)="setBudget($event)"
          />
          <button
            type="button"
            class="mn-button"
            data-testid="save-story-token-budget"
            [disabled]="!text.isStoryTokenBudgetValid() || !text.hasUnsavedStoryTokenBudget()"
            (click)="saveBudget()"
          >
            Save
          </button>
        </div>
        <p class="mn-hint">Maximum completion budget for generated stories, including reasoning.</p>
      </div>

      @if (policy.isTooLong()) {
        <p id="mn-policy-error" role="alert" class="warning">
          Shorten the policy to {{ maxLength }} characters or fewer before saving.
        </p>
      }

      <div class="actions-row">
        <button
          type="button"
          class="mn-button mn-button--primary"
          data-testid="save-policy"
          [disabled]="policy.action() !== 'idle' || policy.isTooLong()"
          (click)="save()"
        >
          Save policy
        </button>
        <p role="status" class="mn-hint" data-testid="policy-state">{{ stateLabel() }}</p>
      </div>

      @if (policy.failure(); as failure) {
        <p role="alert" class="warning">{{ failure.message }}</p>
      }
    </section>
  `,
  styles: `
    .actions-row {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      align-items: center;
    }

    .warning {
      margin: 0;
      color: var(--status-danger);
    }
    .token-budget {
      max-width: 28rem;
    }
    .budget-row {
      display: grid;
      grid-template-columns: minmax(8rem, 1fr) auto;
      gap: var(--space-2);
    }
  `,
})
export class GenerationPolicySectionComponent {
  protected readonly policy = inject(ExceptionPolicyStore);
  protected readonly text = inject(TextModelStore);
  protected readonly maxLength = MAX_POLICY_LENGTH;

  protected readonly countLabel = computed(
    () => `${String(this.policy.draft().length)} of ${String(MAX_POLICY_LENGTH)} characters`,
  );

  protected readonly stateLabel = computed(() => {
    if (this.policy.hasUnsavedChanges()) {
      return 'Unsaved changes.';
    }
    if (this.policy.justSaved()) {
      return 'Policy saved.';
    }
    return this.policy.policy().text === ''
      ? 'No policy set. Every unknown word will be rejected.'
      : 'Policy saved.';
  });

  constructor() {
    void this.policy.load();
  }

  protected onInput(event: Event): void {
    this.policy.setDraft((event.target as HTMLTextAreaElement).value);
  }

  protected save(): void {
    void this.policy.save();
  }

  protected setBudget(event: Event): void {
    this.text.setStoryTokenBudgetDraft((event.target as HTMLInputElement).value);
  }

  protected saveBudget(): void {
    void this.text.saveStoryTokenBudget();
  }
}
