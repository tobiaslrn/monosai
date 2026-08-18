import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { GrammarProfileStore } from '../../application/grammar/grammar-profile.store';
import {
  MAXIMUM_GUIDANCE_LENGTH,
  REGISTER_PREFERENCES,
  type RegisterPreference,
} from '../../domain/grammar/presets';
import { REGISTER_LABELS } from './register-labels';

/**
 * Register preference and the custom-guidance escape hatch.
 *
 * Custom guidance is a copy of the selected preset's prose that the learner
 * edits, rather than a form asking them to describe grammar in English. It
 * behaves exactly as a preset does once saved.
 */
@Component({
  selector: 'mn-guidance-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset>
      <legend>Register</legend>
      <div class="options">
        @for (option of registerOptions; track option.value) {
          <label>
            <input
              type="radio"
              name="grammar-register"
              [value]="option.value"
              [checked]="store.selection().registerPreference === option.value"
              (change)="selectRegister(option.value)"
            />
            <span>{{ option.label }}</span>
          </label>
        }
      </div>
      <p class="mn-hint">
        Casual and polite Japanese are learned in different orders, so this is separate from your
        reading level.
      </p>
    </fieldset>

    <fieldset>
      <legend>Wording sent to the model</legend>

      @if (editing()) {
        <label class="field">
          <span class="mn-hint">
            Edit this to describe what you can read. It replaces the preset wording.
          </span>
          <textarea
            rows="8"
            [attr.maxlength]="maximumLength"
            [value]="draft()"
            (input)="updateDraft($event)"
          ></textarea>
        </label>
        <p class="mn-hint">{{ draft().length }} of {{ maximumLength }} characters</p>
        <div class="actions">
          <button type="button" (click)="save()">Save wording</button>
          <button type="button" class="mn-secondary" (click)="cancel()">Cancel</button>
          @if (store.isCustomGuidance()) {
            <button type="button" class="mn-secondary" (click)="reset()">Reset to preset</button>
          }
        </div>
      } @else {
        <p class="guidance">{{ store.resolvedGuidance() }}</p>
        <div class="actions">
          <button type="button" (click)="edit()">
            {{ store.isCustomGuidance() ? 'Edit my wording' : 'Use my own wording' }}
          </button>
          @if (store.isCustomGuidance()) {
            <button type="button" class="mn-secondary" (click)="reset()">Reset to preset</button>
          }
        </div>
        @if (store.isCustomGuidance()) {
          <p class="mn-hint">You are using your own wording instead of the preset's.</p>
        }
      }
    </fieldset>
  `,
  styles: `
    fieldset {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      margin: 0;
      padding: 0;
      border: 0;
    }

    .options {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-3);
    }

    .field {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    textarea {
      width: 100%;
      min-height: 44px;
      font: inherit;
    }

    .guidance {
      margin: 0;
      padding: var(--space-3);
      border-radius: var(--radius-control);
      background: var(--surface-raised);
      font-size: var(--text-sm);
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }

    button {
      min-height: 44px;
    }
  `,
})
export class GuidanceSectionComponent {
  protected readonly store = inject(GrammarProfileStore);
  protected readonly maximumLength = MAXIMUM_GUIDANCE_LENGTH;
  protected readonly registerOptions = REGISTER_PREFERENCES.map((value) => ({
    value,
    label: REGISTER_LABELS[value],
  }));

  private readonly editingSignal = signal(false);
  private readonly draftSignal = signal('');

  protected readonly editing = this.editingSignal.asReadonly();
  protected readonly draft = this.draftSignal.asReadonly();

  /** Seeds the editor from the preset so the learner edits prose rather than authoring it. */
  private readonly startingText = computed(
    () =>
      this.store.selection().customGuidance ?? this.store.selectedPreset()?.promptGuidance ?? '',
  );

  protected selectRegister(value: RegisterPreference): void {
    void this.store.selectRegister(value);
  }

  protected edit(): void {
    this.draftSignal.set(this.startingText());
    this.editingSignal.set(true);
  }

  protected updateDraft(event: Event): void {
    this.draftSignal.set((event.target as HTMLTextAreaElement).value);
  }

  protected save(): void {
    void this.store.setCustomGuidance(this.draftSignal());
    this.editingSignal.set(false);
  }

  protected cancel(): void {
    this.editingSignal.set(false);
  }

  protected reset(): void {
    void this.store.resetToPreset();
    this.editingSignal.set(false);
  }
}
