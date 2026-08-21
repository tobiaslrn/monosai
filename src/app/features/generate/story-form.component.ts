import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GenerationDraftStore } from '../../application/generation/generation-draft.store';
import { SENTENCE_RANGES } from '../../domain/ai/story-request';
import type { StoryForm } from '../../domain/reading/reading';
import { IconComponent } from '../../shared-ui/icon/icon.component';

interface FormOption {
  readonly value: StoryForm;
  readonly label: string;
  readonly range: string;
}

/** The length is the whole difference, so the sentence count is the whole label. */
const FORMS: readonly FormOption[] = [
  {
    value: 'micro',
    label: 'Micro',
    range: `${String(SENTENCE_RANGES.micro.min)}–${String(SENTENCE_RANGES.micro.max)} sentences`,
  },
  {
    value: 'short',
    label: 'Short',
    range: `${String(SENTENCE_RANGES.short.min)}–${String(SENTENCE_RANGES.short.max)} sentences`,
  },
];

/**
 * The premise, the story form, and optional style instructions.
 *
 * There is deliberately no genre picker, no topic suggestions, no visible
 * target-vocabulary list, no temperature control, and no prompt editor: the
 * vocabulary the story may use is decided by what the learner has reviewed, and
 * showing a target list would turn reading into a checklist.
 *
 * The Generate button says a network request is about to happen and does not
 * estimate a price, because a number that is wrong is worse than no number.
 */
@Component({
  selector: 'mn-story-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent],
  template: `
    <div class="mn-field">
      <label for="mn-premise">What should the story be about?</label>
      <textarea
        id="mn-premise"
        rows="4"
        data-testid="premise"
        [value]="draft.premise()"
        [attr.aria-describedby]="'mn-premise-count'"
        [attr.aria-invalid]="premiseTooLong()"
        [disabled]="disabled()"
        (input)="onPremise($event)"
      ></textarea>
      <p id="mn-premise-count" class="counter" [class.is-over]="premiseTooLong()">
        {{ draft.premiseLength() }} / {{ draft.premiseLimit }} characters
      </p>
    </div>

    <fieldset class="forms" [disabled]="disabled()">
      <legend>How long should it be?</legend>
      @for (option of formOptions; track option.value) {
        <label class="form-card" [class.is-selected]="draft.form() === option.value">
          <input
            type="radio"
            name="mn-story-form"
            [value]="option.value"
            [checked]="draft.form() === option.value"
            (change)="draft.setForm(option.value)"
          />
          <span class="form-body">
            <span class="form-name">{{ option.label }}</span>
            <span class="form-range">{{ option.range }}</span>
          </span>
        </label>
      }
    </fieldset>

    <div class="mn-field">
      <label for="mn-instructions">Special instructions (optional)</label>
      <textarea
        id="mn-instructions"
        rows="3"
        data-testid="special-instructions"
        [value]="draft.specialInstructions()"
        [attr.aria-describedby]="'mn-instructions-help mn-instructions-count'"
        [attr.aria-invalid]="instructionsTooLong()"
        [disabled]="disabled()"
        (input)="onInstructions($event)"
      ></textarea>
      <p id="mn-instructions-help" class="mn-hint">
        Guide the tone, viewpoint, dialogue, or register — for example “write it as a diary entry”
        or “keep it gentle and funny”. These cannot change the length, the vocabulary rules, or how
        the story is checked.
      </p>
      <p id="mn-instructions-count" class="counter" [class.is-over]="instructionsTooLong()">
        {{ draft.instructionsLength() }} / {{ draft.instructionsLimit }} characters
      </p>
    </div>

    <!--
      One line, immediately above the button that acts on it: what the story is
      written from, and where each half of that is changed. It used to be said
      three times on this screen, in three different places.
    -->
    <p class="sources" data-testid="form-sources">
      Written from your
      <a routerLink="/vocabulary">{{ snapshotSummary() }}</a>
      using the
      <a routerLink="/grammar">{{ presetName() }}</a>
      grammar preset.
    </p>

    <div class="actions">
      <button
        type="button"
        class="mn-button mn-button--primary"
        data-testid="generate"
        [disabled]="disabled() || !canGenerate()"
        (click)="generate.emit()"
      >
        <mn-icon name="generate" [size]="18" />
        <span>Generate story</span>
      </button>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }

    .counter {
      margin: 0;
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    .counter.is-over {
      color: var(--status-danger);
      font-weight: 600;
    }

    .forms {
      display: grid;
      gap: var(--space-3);
      margin: 0;
      padding: 0;
      border: 0;
    }

    .forms legend {
      padding: 0;
      font-weight: 500;
    }

    @media (min-width: 640px) {
      .forms {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .forms legend {
        grid-column: 1 / -1;
      }
    }

    .form-card {
      display: flex;
      gap: var(--space-3);
      align-items: flex-start;
      padding: var(--space-4);
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-card);
      background: var(--surface-raised);
      cursor: pointer;
    }

    .form-card.is-selected {
      border-color: var(--action-primary);
      box-shadow: inset 0 0 0 1px var(--action-primary);
    }

    .form-body {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
      min-width: 0;
    }

    .form-name {
      font-weight: 600;
    }

    .form-range {
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    .sources {
      margin: 0;
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-3);
      align-items: center;
    }
  `,
})
export class StoryFormComponent {
  protected readonly draft = inject(GenerationDraftStore);

  readonly canGenerate = input.required<boolean>();
  readonly disabled = input.required<boolean>();
  readonly snapshotSummary = input.required<string>();
  readonly presetName = input.required<string>();

  readonly generate = output<void>();

  protected readonly formOptions = FORMS;

  protected readonly premiseTooLong = computed(
    () => this.draft.premiseLength() > this.draft.premiseLimit,
  );
  protected readonly instructionsTooLong = computed(
    () => this.draft.instructionsLength() > this.draft.instructionsLimit,
  );

  protected onPremise(event: Event): void {
    this.draft.setPremise((event.target as HTMLTextAreaElement).value);
  }

  protected onInstructions(event: Event): void {
    this.draft.setSpecialInstructions((event.target as HTMLTextAreaElement).value);
  }
}
