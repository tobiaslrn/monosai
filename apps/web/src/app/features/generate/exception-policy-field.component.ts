import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
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
 * The composer groups this with saved defaults and explicitly labels its scope.
 */
@Component({
  selector: 'mn-exception-policy-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mn-stack">
      <div class="mn-field">
        <label for="mn-policy-text">Vocabulary exceptions (optional)</label>
        <textarea
          id="mn-policy-text"
          rows="3"
          data-testid="policy-input"
          placeholder="Names or words the story may use outside your vocabulary"
          [attr.aria-describedby]="policyDescriptionIds()"
          [value]="policy.draft()"
          (input)="onInput($event)"
        ></textarea>
        @if (policyCounterVisible()) {
          <p id="mn-policy-count" class="mn-hint">{{ countLabel() }}</p>
        }
      </div>

      @if (policy.isTooLong()) {
        <p id="mn-policy-error" role="alert" class="mn-field-error">
          Remove {{ overLimitLabel() }} to continue.
        </p>
      }

      <!--
        Everything else in this panel saves the moment it changes. The one
        field that needs a press offers it only while there is something to
        save, rather than standing disabled beside settings that need none.
      -->
      @if (policy.hasUnsavedChanges() || policy.action() !== 'idle') {
        <div class="mn-actions">
          <button
            type="button"
            class="mn-button"
            data-testid="save-policy"
            [disabled]="policy.action() !== 'idle' || policy.isTooLong()"
            (click)="save()"
          >
            Save exceptions
          </button>
        </div>
      }

      @if (saved() && !policy.hasUnsavedChanges()) {
        <p class="mn-hint" role="status">Exceptions saved as a default.</p>
      }
      @if (policy.failure(); as failure) {
        <p role="alert" class="mn-notice mn-notice--error">{{ failure.message }}</p>
      }
    </div>
  `,
})
export class ExceptionPolicyFieldComponent {
  protected readonly saved = signal(false);
  protected readonly policy = inject(ExceptionPolicyStore);

  protected readonly countLabel = computed(
    () =>
      `${formatCount(this.policy.draft().length)} of ${formatCount(MAX_POLICY_LENGTH)} characters`,
  );
  protected readonly policyCounterVisible = computed(
    () => this.policy.draft().length >= Math.ceil(MAX_POLICY_LENGTH * 0.8),
  );
  protected readonly policyDescriptionIds = computed(() => {
    const ids: string[] = [];
    if (this.policyCounterVisible()) ids.push('mn-policy-count');
    if (this.policy.isTooLong()) ids.push('mn-policy-error');
    return ids.length > 0 ? ids.join(' ') : null;
  });
  protected readonly overLimitLabel = computed(() =>
    formatCountOf(this.policy.draft().length - MAX_POLICY_LENGTH, 'character'),
  );

  constructor() {
    void this.policy.load();
  }

  protected onInput(event: Event): void {
    this.policy.setDraft((event.target as HTMLTextAreaElement).value);
  }

  protected async save(): Promise<void> {
    this.saved.set(false);
    await this.policy.save();
    this.saved.set(this.policy.failure() === null);
  }
}
