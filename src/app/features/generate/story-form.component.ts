import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { navigationOriginState } from '../../core/routing/navigation-history.service';
import { GenerationDraftStore } from '../../application/generation/generation-draft.store';
import {
  STORY_LENGTH_RELIABILITY_WARNING_SENTENCES,
  STORY_SENTENCE_COUNTS,
} from '../../domain/ai/story-request';
import type { AnkiWordPriorityMode, VocabularyStrictness } from '../../domain/settings/settings';
import type { ConfigurationReadiness } from '../../domain/ai/configuration-readiness';
import type { PreparationLayer } from '../../domain/enrichment/preparation';
import { formatCount, formatCountOf } from '../../domain/shared/locale';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import { PreparationTargetsComponent } from '../../shared-ui/preparation-targets/preparation-targets.component';

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
  imports: [RouterLink, IconComponent, PreparationTargetsComponent],
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
            [attr.aria-describedby]="premiseDescriptionIds()"
            [attr.aria-invalid]="premiseTooLong()"
            [disabled]="disabled()"
            (input)="onPremise($event)"
          ></textarea>
          <p id="mn-premise-count" class="counter" [class.is-over]="premiseTooLong()">
            {{ formatCount(draft.premiseLength()) }} of
            {{ formatCount(draft.premiseLimit) }} characters
          </p>
          @if (premiseTooLong()) {
            <p id="mn-premise-limit" class="limit-hint" role="alert">
              {{ premiseLimitMessage() }}
            </p>
          }
        </div>

        <div class="mn-field">
          <label for="mn-instructions">Special instructions (optional)</label>
          <textarea
            id="mn-instructions"
            rows="4"
            data-testid="special-instructions"
            placeholder="Tone, viewpoint, dialogue, or register (optional)"
            [value]="draft.specialInstructions()"
            [attr.aria-describedby]="instructionsDescriptionIds()"
            [attr.aria-invalid]="instructionsTooLong()"
            [disabled]="disabled()"
            (input)="onInstructions($event)"
          ></textarea>
          <p id="mn-instructions-count" class="counter" [class.is-over]="instructionsTooLong()">
            {{ formatCount(draft.instructionsLength()) }} of
            {{ formatCount(draft.instructionsLimit) }} characters
          </p>
          @if (instructionsTooLong()) {
            <p id="mn-instructions-limit" class="limit-hint" role="alert">
              {{ instructionsLimitMessage() }}
            </p>
          }
        </div>

        <ng-content select="[text-fields-extra]" />
      </div>

      <aside class="story-settings" aria-label="Story settings">
        <div class="setting-heading">
          <div>
            <label for="mn-story-length">Length</label>
          </div>
          <output for="mn-story-length" aria-live="polite">
            <span>about</span>
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
          [attr.aria-describedby]="lengthDescriptionIds()"
          [style.--slider-progress.%]="sliderProgress()"
          [style.--slider-step.%]="sliderStep()"
          (input)="onSentenceCount($event)"
        />
        <div class="length-scale" aria-hidden="true">
          @for (label of lengthLabels; track label) {
            <span>{{ label }}</span>
          }
        </div>
        @if (showLengthWarning()) {
          <p id="mn-length-warning" class="length-warning" role="status">
            <mn-icon name="warning" [size]="17" />
            <span>
              At this length, models are much less reliable at following your grammar and vocabulary
              settings. You can still generate the story.
            </span>
          </p>
        }

        <div class="mn-field word-selection">
          <label for="mn-word-selection">Anki word selection</label>
          <select
            id="mn-word-selection"
            data-testid="word-priority-select"
            [value]="ankiWordPriorityMode()"
            [disabled]="disabled()"
            (change)="onWordPriorityMode($event)"
          >
            <option value="uniform">Uniform</option>
            <option value="recent">Recently learned</option>
            <option value="difficult">Difficult</option>
          </select>
        </div>

        <mn-preparation-targets
          class="preparation-targets"
          legend="Prepare after generation"
          [targets]="preparationTargets()"
          [audioReadiness]="audioReadiness()"
          [disabled]="disabled()"
          (targetsChanged)="preparationTargetsChanged.emit($event)"
        />

        <details class="mn-disclosure strictness">
          <summary>Vocabulary strictness</summary>
          <fieldset [disabled]="disabled()">
            <legend class="mn-visually-hidden">Vocabulary strictness</legend>
            <label>
              <input
                type="radio"
                name="mn-vocabulary-strictness"
                value="relaxed"
                [checked]="vocabularyStrictness() === 'relaxed'"
                (change)="onVocabularyStrictness($event)"
              />
              <span><strong>Relaxed</strong> Keep the first draft</span>
            </label>
            <label>
              <input
                type="radio"
                name="mn-vocabulary-strictness"
                value="standard"
                [checked]="vocabularyStrictness() === 'standard'"
                (change)="onVocabularyStrictness($event)"
              />
              <span><strong>Standard</strong> Try once to replace unfamiliar words</span>
            </label>
            <label>
              <input
                type="radio"
                name="mn-vocabulary-strictness"
                value="strict"
                [checked]="vocabularyStrictness() === 'strict'"
                (change)="onVocabularyStrictness($event)"
              />
              <span><strong>Strict</strong> Try twice to replace unfamiliar words</span>
            </label>
          </fieldset>
        </details>

        <div class="generation-sources" data-testid="form-sources">
          <p class="setting-section-title">Uses</p>
          <a
            routerLink="/vocabulary"
            [queryParams]="{ from: 'generate' }"
            [state]="generateOriginState"
          >
            <span>Vocabulary</span>
            <strong>{{ snapshotSummary() }}</strong>
          </a>
          <a
            routerLink="/grammar"
            [queryParams]="{ from: 'generate' }"
            [state]="generateOriginState"
          >
            <span>Grammar</span>
            <strong>{{ presetName() }}</strong>
          </a>
        </div>
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
          @if (atGenerationLimit()) {
            <p class="mn-hint" data-testid="generation-limit">
              You already have as many stories being written as Monosai runs at once. This one can
              start when one of them finishes.
            </p>
          }
        </div>
      </aside>
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

    .limit-hint {
      margin: calc(var(--space-1) * -1) 0 0;
      color: var(--status-danger);
      font-size: var(--text-sm);
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

    .story-settings {
      display: flex;
      flex-direction: column;
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

    .setting-heading label {
      font-weight: 600;
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
          transparent 0 calc(var(--slider-step) - 1px),
          color-mix(in srgb, var(--border-strong) 20%, transparent) calc(var(--slider-step) - 1px)
            var(--slider-step)
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
        transparent 0 calc(var(--slider-step) - 1px),
        color-mix(in srgb, var(--border-strong) 20%, transparent) calc(var(--slider-step) - 1px)
          var(--slider-step)
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

    .length-warning {
      display: flex;
      gap: var(--space-2);
      align-items: flex-start;
      margin: var(--space-3) 0 0;
      padding: var(--space-3);
      border: 1px solid color-mix(in srgb, var(--status-warning) 28%, transparent);
      border-radius: var(--radius-control);
      background: var(--status-warning-soft);
      color: var(--status-warning);
      font-size: var(--text-sm);
      line-height: 1.45;
    }

    .length-warning mn-icon {
      margin-top: 1px;
    }

    .word-selection {
      margin-top: var(--space-5);
      padding-top: var(--space-4);
      border-top: 1px solid var(--border-subtle);
    }

    .strictness {
      margin-top: var(--space-3);
    }

    .preparation-targets {
      margin-top: var(--space-4);
      padding-top: var(--space-3);
      border-top: 1px solid var(--border-subtle);
    }

    .strictness fieldset {
      display: grid;
      gap: var(--space-2);
      margin: 0;
      padding: 0 0 0 var(--space-4);
      border: 0;
    }

    .strictness label {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: var(--space-2);
      align-items: start;
      min-height: var(--touch-target);
      color: var(--text-secondary);
      font-size: var(--text-sm);
      cursor: pointer;
    }

    .strictness input {
      margin-top: 0.2rem;
    }

    .strictness strong {
      display: block;
      color: var(--text-primary);
    }

    @media (max-width: 719px) {
      .composer-grid {
        grid-template-columns: minmax(0, 1fr);
      }

      .text-fields,
      .story-settings {
        padding: var(--space-4);
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

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-3);
      align-items: center;
      justify-content: flex-end;
      padding-top: var(--space-5);
    }
  `,
})
export class StoryFormComponent {
  protected readonly generateOriginState = navigationOriginState('/generate');
  protected readonly draft = inject(GenerationDraftStore);

  readonly canGenerate = input.required<boolean>();
  readonly disabled = input.required<boolean>();
  /** Whether enough stories are already being written that this one must wait. */
  readonly atGenerationLimit = input(false);
  readonly snapshotSummary = input.required<string>();
  readonly presetName = input.required<string>();
  readonly ankiWordPriorityMode = input<AnkiWordPriorityMode>('uniform');
  readonly vocabularyStrictness = input<VocabularyStrictness>('standard');
  readonly preparationTargets = input<readonly PreparationLayer[]>(['english', 'grammar']);
  readonly audioReadiness = input<ConfigurationReadiness>('not-configured');

  readonly generate = output<void>();
  readonly ankiWordPriorityModeChanged = output<AnkiWordPriorityMode>();
  readonly vocabularyStrictnessChanged = output<VocabularyStrictness>();
  readonly preparationTargetsChanged = output<readonly PreparationLayer[]>();

  protected readonly lengthOptions = STORY_SENTENCE_COUNTS;
  protected readonly lengthLabels = LENGTH_LABELS;
  protected readonly formatCount = formatCount;

  protected readonly selectedLengthIndex = computed(() => {
    const index = STORY_SENTENCE_COUNTS.indexOf(
      this.draft.sentenceCount() as (typeof STORY_SENTENCE_COUNTS)[number],
    );
    return index < 0 ? 0 : index;
  });

  protected readonly selectedLengthLabel = computed(
    () => LENGTH_LABELS[Math.min(this.selectedLengthIndex(), LENGTH_LABELS.length - 1)],
  );

  protected readonly lengthAriaValue = computed(
    () => `${this.selectedLengthLabel()}, ${String(this.draft.sentenceCount())} sentences`,
  );

  protected readonly sliderProgress = computed(
    () => (this.selectedLengthIndex() / (STORY_SENTENCE_COUNTS.length - 1)) * 100,
  );

  protected readonly sliderStep = computed(() => 100 / (STORY_SENTENCE_COUNTS.length - 1));

  protected readonly showLengthWarning = computed(
    () => this.draft.sentenceCount() >= STORY_LENGTH_RELIABILITY_WARNING_SENTENCES,
  );

  protected readonly lengthDescriptionIds = computed(() =>
    this.showLengthWarning() ? 'mn-length-warning' : null,
  );

  protected readonly premiseTooLong = computed(
    () => this.draft.premiseLength() > this.draft.premiseLimit,
  );
  protected readonly instructionsTooLong = computed(
    () => this.draft.instructionsLength() > this.draft.instructionsLimit,
  );
  protected readonly premiseDescriptionIds = computed(() =>
    this.premiseTooLong() ? 'mn-premise-count mn-premise-limit' : 'mn-premise-count',
  );
  protected readonly instructionsDescriptionIds = computed(() =>
    this.instructionsTooLong()
      ? 'mn-instructions-count mn-instructions-limit'
      : 'mn-instructions-count',
  );
  protected readonly premiseLimitMessage = computed(() =>
    this.limitMessage(this.draft.premiseLength() - this.draft.premiseLimit),
  );
  protected readonly instructionsLimitMessage = computed(() =>
    this.limitMessage(this.draft.instructionsLength() - this.draft.instructionsLimit),
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

  protected onWordPriorityMode(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value === 'uniform' || value === 'recent' || value === 'difficult') {
      this.ankiWordPriorityModeChanged.emit(value);
    }
  }

  protected onVocabularyStrictness(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (value === 'relaxed' || value === 'standard' || value === 'strict') {
      this.vocabularyStrictnessChanged.emit(value);
    }
  }

  private limitMessage(overBy: number): string {
    return `Remove ${formatCountOf(overBy, 'character')} to continue.`;
  }
}
