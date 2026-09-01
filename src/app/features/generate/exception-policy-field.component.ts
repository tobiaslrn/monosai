import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import {
  ExceptionPolicyStore,
  MAX_POLICY_LENGTH,
} from '../../application/settings/exception-policy.store';
import { formatCount, formatCountOf } from '../../domain/shared/locale';

/**
 * The single global exception policy.
 *
 * It only ever applies while a story is being generated, and each story keeps
 * the wording that was in force when it was made: editing this changes what
 * future stories are judged against and never rewrites an existing one.
 */
@Component({
  selector: 'mn-exception-policy-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="policy">
      <div class="mn-field">
        <label for="mn-policy-text">Vocabulary exceptions (optional)</label>
        <textarea
          id="mn-policy-text"
          rows="3"
          data-testid="policy-input"
          placeholder="Names or words the story may use outside your vocabulary"
          [attr.aria-describedby]="
            policy.isTooLong() ? 'mn-policy-count mn-policy-error' : 'mn-policy-count'
          "
          [value]="policy.draft()"
          (input)="onInput($event)"
        ></textarea>
        <p id="mn-policy-count" class="mn-hint">{{ countLabel() }}</p>
      </div>

      @if (policy.isTooLong()) {
        <p id="mn-policy-error" role="alert" class="warning">
          Remove {{ overLimitLabel() }} to continue.
        </p>
      }

      <div class="actions-row">
        <button
          type="button"
          class="mn-button mn-button--primary"
          data-testid="save-policy"
          [disabled]="
            policy.action() !== 'idle' || policy.isTooLong() || !policy.hasUnsavedChanges()
          "
          (click)="save()"
        >
          Save exceptions
        </button>
      </div>

      @if (policy.failure(); as failure) {
        <p role="alert" class="warning">{{ failure.message }}</p>
      }
    </div>
  `,
  styles: `
    .actions-row {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      align-items: center;
    }
    .policy {
      display: grid;
      gap: var(--space-3);
    }

    .warning {
      margin: 0;
      color: var(--status-danger);
    }
  `,
})
export class ExceptionPolicyFieldComponent {
  protected readonly policy = inject(ExceptionPolicyStore);

  protected readonly countLabel = computed(
    () =>
      `${formatCount(this.policy.draft().length)} of ${formatCount(MAX_POLICY_LENGTH)} characters`,
  );
  protected readonly overLimitLabel = computed(() =>
    formatCountOf(this.policy.draft().length - MAX_POLICY_LENGTH, 'character'),
  );

  constructor() {
    void this.policy.load();
  }

  protected onInput(event: Event): void {
    this.policy.setDraft((event.target as HTMLTextAreaElement).value);
  }

  protected save(): void {
    void this.policy.save();
  }
}
