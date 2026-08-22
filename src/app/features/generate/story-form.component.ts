import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GenerationDraftStore } from '../../application/generation/generation-draft.store';
import { STORY_SENTENCE_COUNTS } from '../../domain/ai/story-request';
import { IconComponent } from '../../shared-ui/icon/icon.component';

const LENGTH_LABELS = ['Tiny', 'Short', 'Medium', 'Long'] as const;

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
    <div class="composer-grid">
      <div class="text-fields">
        <div class="mn-field">
          <label for="mn-premise">What should the story be about?</label>
          <textarea
            id="mn-premise"
            rows="5"
            data-testid="premise"
            placeholder="Describe what the story should be about (up to 1,000 characters)"
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

        <div class="mn-field">
          <label for="mn-instructions">Special instructions (optional)</label>
          <textarea
            id="mn-instructions"
            rows="4"
            data-testid="special-instructions"
            placeholder="Tone, viewpoint, dialogue, or register (optional)"
            [value]="draft.specialInstructions()"
            [attr.aria-describedby]="'mn-instructions-count'"
            [attr.aria-invalid]="instructionsTooLong()"
            [disabled]="disabled()"
            (input)="onInstructions($event)"
          ></textarea>
          <p id="mn-instructions-count" class="counter" [class.is-over]="instructionsTooLong()">
            {{ draft.instructionsLength() }} / {{ draft.instructionsLimit }} characters
          </p>
        </div>
      </div>

      <aside class="story-settings" aria-label="Story settings">
        <div class="setting-heading">
          <div>
            <label for="mn-story-length">Length</label>
            <p id="mn-length-help">{{ selectedLengthLabel() }}</p>
          </div>
          <output for="mn-story-length" aria-live="polite">
            <strong>{{ draft.sentenceCount() }}</strong>
            <span>sentences</span>
          </output>
        </div>
        <input
          id="mn-story-length"
          class="length-slider"
          type="range"
          data-testid="story-length"
          min="0"
          [max]="lengthOptions.length - 1"
          step="1"
          [value]="selectedLengthIndex()"
          [disabled]="disabled()"
          [attr.aria-valuetext]="lengthAriaValue()"
          [attr.aria-describedby]="'mn-length-help'"
          [style.--slider-progress.%]="sliderProgress()"
          (input)="onSentenceCount($event)"
        />
        <div class="length-scale" aria-hidden="true">
          @for (label of lengthLabels; track label) {
            <span>{{ label }}</span>
          }
        </div>

        <div class="mn-field model-picker">
          <label for="mn-story-model">Model</label>
          <select
            id="mn-story-model"
            data-testid="story-model-select"
            [value]="selectedModelId() ?? ''"
            [disabled]="disabled()"
            (change)="modelSelected.emit($any($event.target).value || null)"
          >
            @for (model of models(); track model.id) {
              <option [value]="model.id">
                {{ model.name }}{{ model.isDefault ? ' (Default)' : '' }}
              </option>
            }
          </select>
        </div>

        <div class="word-selection">
          <div class="setting-label">
            <label for="mn-word-selection">Anki word selection</label>
            <span>Preview</span>
          </div>
          <select id="mn-word-selection" disabled aria-describedby="mn-word-selection-help">
            <option>Random distribution</option>
            <option>Focus on recent words</option>
          </select>
          <p id="mn-word-selection-help">More selection modes are coming later.</p>
        </div>

        <div class="generation-sources" data-testid="form-sources">
          <p class="setting-section-title">Uses</p>
          <a routerLink="/vocabulary">
            <span>Vocabulary</span>
            <strong>{{ snapshotSummary() }}</strong>
          </a>
          <a routerLink="/grammar">
            <span>Grammar</span>
            <strong>{{ presetName() }}</strong>
          </a>
        </div>
      </aside>
    </div>

    <footer class="form-footer">
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
    </footer>
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
      text-align: right;
    }

    .counter.is-over {
      color: var(--status-danger);
      font-weight: 600;
    }

    .composer-grid {
      display: grid;
      grid-template-columns: minmax(0, 1.85fr) minmax(280px, 1fr);
      gap: var(--space-5);
      align-items: stretch;
    }

    .text-fields,
    .story-settings {
      padding: var(--space-5);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-card);
      background: var(--surface-raised);
      box-shadow: var(--shadow-raised);
    }

    .text-fields {
      display: flex;
      flex-direction: column;
      gap: var(--space-5);
      min-width: 0;
    }

    .text-fields textarea {
      background: var(--surface-panel);
    }

    .setting-heading {
      display: flex;
      gap: var(--space-4);
      align-items: flex-start;
      justify-content: space-between;
    }

    .setting-heading label,
    .setting-label label {
      font-weight: 600;
    }

    .setting-heading p,
    .word-selection p {
      margin: var(--space-1) 0 0;
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    output {
      display: flex;
      flex-direction: column;
      align-items: center;
      min-width: 76px;
      padding: var(--space-2) var(--space-3);
      border-radius: 4px;
      background: var(--action-primary-soft);
      color: var(--action-primary);
    }

    output strong {
      font-size: 24px;
      line-height: 1;
    }

    output span {
      font-size: var(--text-sm);
    }

    .length-slider {
      width: 100%;
      height: var(--touch-target);
      margin: var(--space-3) 0 0;
      padding: 0;
      appearance: none;
      background: transparent;
      cursor: pointer;
    }

    .length-slider::-webkit-slider-runnable-track {
      height: 10px;
      border-radius: var(--radius-pill);
      background-color: var(--surface-sunken);
      background-image:
        repeating-linear-gradient(
          to right,
          transparent 0 calc(11.111% - 1px),
          color-mix(in srgb, var(--border-strong) 20%, transparent) calc(11.111% - 1px) 11.111%
        ),
        linear-gradient(
          to right,
          var(--action-primary) 0 var(--slider-progress),
          transparent var(--slider-progress) 100%
        );
    }

    .length-slider::-webkit-slider-thumb {
      width: 22px;
      height: 22px;
      margin-top: -6px;
      border: 4px solid var(--surface-raised);
      border-radius: 50%;
      appearance: none;
      background: var(--action-primary);
      box-shadow: 0 0 0 1px var(--action-primary);
    }

    .length-slider::-moz-range-track {
      height: 10px;
      border-radius: var(--radius-pill);
      background-color: var(--surface-sunken);
      background-image: repeating-linear-gradient(
        to right,
        transparent 0 calc(11.111% - 1px),
        color-mix(in srgb, var(--border-strong) 20%, transparent) calc(11.111% - 1px) 11.111%
      );
    }

    .length-slider::-moz-range-progress {
      height: 10px;
      border-radius: var(--radius-pill);
      background: var(--action-primary);
    }

    .length-slider::-moz-range-thumb {
      width: 14px;
      height: 14px;
      border: 4px solid var(--surface-raised);
      border-radius: 50%;
      background: var(--action-primary);
      box-shadow: 0 0 0 1px var(--action-primary);
    }

    .length-slider:focus-visible {
      outline: 3px solid var(--focus-ring);
      outline-offset: 2px;
      border-radius: var(--radius-pill);
    }

    .length-scale {
      display: flex;
      justify-content: space-between;
      margin-top: calc(-1 * var(--space-2));
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    .length-scale span {
      width: 25%;
      text-align: center;
    }

    .length-scale span:first-child {
      text-align: left;
    }

    .length-scale span:last-child {
      text-align: right;
    }

    .word-selection {
      margin-top: var(--space-5);
      padding-top: var(--space-4);
      border-top: 1px solid var(--border-subtle);
    }

    .setting-label {
      display: flex;
      gap: var(--space-2);
      align-items: center;
      justify-content: space-between;
    }

    .setting-label span {
      padding: 2px var(--space-2);
      border-radius: var(--radius-pill);
      background: var(--surface-sunken);
      color: var(--text-secondary);
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .word-selection select {
      width: 100%;
      min-height: var(--touch-target);
      margin-top: var(--space-2);
    }

    @media (max-width: 719px) {
      .composer-grid {
        grid-template-columns: minmax(0, 1fr);
      }

      .text-fields,
      .story-settings {
        padding: var(--space-4);
      }

      .actions,
      .actions .mn-button {
        width: 100%;
      }
    }

    .generation-sources {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      margin-top: var(--space-5);
      padding-top: var(--space-4);
      border-top: 1px solid var(--border-subtle);
    }

    .setting-section-title {
      margin: 0 0 var(--space-1);
      color: var(--text-secondary);
      font-size: var(--text-sm);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .generation-sources a {
      display: flex;
      gap: var(--space-3);
      align-items: baseline;
      justify-content: space-between;
      min-height: 32px;
      color: var(--text-primary);
      font-size: var(--text-sm);
      text-decoration: none;
    }

    .generation-sources a:hover strong {
      text-decoration-thickness: 2px;
    }

    .generation-sources a span {
      color: var(--text-secondary);
    }

    .generation-sources a strong {
      overflow: hidden;
      font-weight: 600;
      text-decoration: underline;
      text-underline-offset: 3px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .form-footer {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-3) var(--space-5);
      align-items: center;
      justify-content: flex-end;
      padding-top: var(--space-1);
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
  readonly models = input<
    readonly { readonly id: string; readonly name: string; readonly isDefault: boolean }[]
  >([]);
  readonly selectedModelId = input<string | null>(null);

  readonly generate = output<void>();
  readonly modelSelected = output<string | null>();

  protected readonly lengthOptions = STORY_SENTENCE_COUNTS;
  protected readonly lengthLabels = LENGTH_LABELS;

  protected readonly selectedLengthIndex = computed(() => {
    const index = STORY_SENTENCE_COUNTS.indexOf(
      this.draft.sentenceCount() as (typeof STORY_SENTENCE_COUNTS)[number],
    );
    return index < 0 ? 0 : index;
  });

  protected readonly selectedLengthLabel = computed(
    () => LENGTH_LABELS[this.selectedLengthIndex()],
  );

  protected readonly lengthAriaValue = computed(
    () => `${this.selectedLengthLabel()}, ${String(this.draft.sentenceCount())} sentences`,
  );

  protected readonly sliderProgress = computed(
    () => (this.selectedLengthIndex() / (STORY_SENTENCE_COUNTS.length - 1)) * 100,
  );

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

  protected onSentenceCount(event: Event): void {
    const index = (event.target as HTMLInputElement).valueAsNumber;
    const sentenceCount = STORY_SENTENCE_COUNTS.at(index);
    if (sentenceCount !== undefined) {
      this.draft.setSentenceCount(sentenceCount);
    }
  }
}
