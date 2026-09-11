import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { navigationOriginState } from '../../core/routing/navigation-history.service';
import { GenerationDraftStore } from '../../application/generation/generation-draft.store';
import {
  STORY_LENGTH_RELIABILITY_WARNING_SENTENCES,
  STORY_SENTENCE_COUNTS,
} from '../../domain/ai/story-request';
import {
  DEFAULT_RECENT_FOCUS_SIZE,
  RECENT_FOCUS_SIZES,
  isRecentFocusSize,
  type AnkiWordPriorityMode,
  type RecentFocusSize,
  type VocabularyStrictness,
} from '../../domain/settings/settings';
import type { ConfigurationReadiness } from '../../domain/ai/configuration-readiness';
import type { PreparationLayer } from '../../domain/enrichment/preparation';
import { formatCount, formatCountOf } from '../../domain/shared/locale';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import { PreparationTargetsComponent } from '../../shared-ui/preparation-targets/preparation-targets.component';

const LENGTH_LABELS = ['Tiny', 'Short', 'Medium', 'Long'] as const;

/**
 * Option A: premise, instructions and length belong to this draft. Persisted
 * controls live in a separate defaults region and report when a default is saved.
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
    <!--
      What is missing leads the form, in the document flow: it is why the
      button at the foot is disabled, so it is read before the fields are
      filled. Inside the sticky bar it rode up over the fields themselves.
    -->
    <ng-content select="[generation-blockers]" />
    <div class="composer-grid">
      <div class="mn-card mn-stack text-fields" role="region" aria-labelledby="mn-this-story">
        <h2 id="mn-this-story" class="mn-card-title">This story</h2>
        <div class="mn-field">
          <label for="mn-premise">What should the story be about? (optional)</label>
          <textarea
            id="mn-premise"
            rows="3"
            data-testid="premise"
            [value]="draft.premise()"
            [attr.aria-describedby]="premiseDescriptionIds()"
            [attr.aria-invalid]="premiseTooLong()"
            [disabled]="disabled()"
            (input)="onPremise($event)"
          ></textarea>
          @if (premiseCounterVisible()) {
            <p id="mn-premise-count" class="counter" [class.is-over]="premiseTooLong()">
              {{ formatCount(draft.premiseLength()) }} of
              {{ formatCount(draft.premiseLimit) }} characters
            </p>
          }
          @if (premiseTooLong()) {
            <p id="mn-premise-limit" class="mn-field-error" role="alert">
              {{ premiseLimitMessage() }}
            </p>
          }
        </div>

        <div class="mn-field">
          <label for="mn-instructions">Special instructions (optional)</label>
          <textarea
            id="mn-instructions"
            rows="2"
            data-testid="special-instructions"
            placeholder="Tone, viewpoint, dialogue, or register"
            [value]="draft.specialInstructions()"
            [attr.aria-describedby]="instructionsDescriptionIds()"
            [attr.aria-invalid]="instructionsTooLong()"
            [disabled]="disabled()"
            (input)="onInstructions($event)"
          ></textarea>
          @if (instructionsCounterVisible()) {
            <p id="mn-instructions-count" class="counter" [class.is-over]="instructionsTooLong()">
              {{ formatCount(draft.instructionsLength()) }} of
              {{ formatCount(draft.instructionsLimit) }} characters
            </p>
          }
          @if (instructionsTooLong()) {
            <p id="mn-instructions-limit" class="mn-field-error" role="alert">
              {{ instructionsLimitMessage() }}
            </p>
          }
        </div>

        <div class="setting-heading">
          <label for="mn-story-length">Length</label>
          <output for="mn-story-length" aria-live="polite">
            {{ selectedLengthLabel() }} · about {{ draft.sentenceCount() }} sentences
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
        @if (showLengthWarning()) {
          <p
            id="mn-length-warning"
            class="length-warning mn-notice mn-notice--warning"
            role="status"
          >
            <mn-icon name="warning" [size]="17" />
            <span> Longer stories may ignore your vocabulary and grammar settings. </span>
          </p>
        }
      </div>

      <aside class="mn-card mn-stack story-settings" aria-label="Story settings">
        <h2 class="mn-card-title">Defaults for every story</h2>
        <ng-content select="[story-defaults]" />

        <mn-preparation-targets
          class="preparation-targets"
          legend="Prepare after generation"
          [targets]="preparationTargets()"
          [audioReadiness]="audioReadiness()"
          [disabled]="disabled()"
          (targetsChanged)="preparationTargetsChanged.emit($event)"
        />

        <div class="word-selection mn-stack mn-stack--tight">
          <div class="mn-field">
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
          @if (ankiWordPriorityMode() === 'recent') {
            <div class="mn-field">
              <label for="mn-focus-size">Focus</label>
              <select
                id="mn-focus-size"
                data-testid="focus-size-select"
                [disabled]="disabled()"
                (change)="onRecentFocusSize($event)"
              >
                @for (size of focusSizes; track size) {
                  <option [value]="size" [selected]="size === recentFocusSize()">
                    Newest {{ size }} words
                  </option>
                }
              </select>
            </div>
          }
        </div>

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

        @if (defaultFeedback()) {
          <p class="mn-hint" role="status">{{ defaultFeedback() }}</p>
        }

        <div class="generation-sources mn-stack" data-testid="form-sources">
          <p class="mn-group-title">Uses</p>
          <dl class="mn-facts">
            <div>
              <dt>
                <a
                  routerLink="/reading-level"
                  fragment="words"
                  [queryParams]="{ from: 'generate' }"
                  [state]="generateOriginState"
                >
                  Vocabulary
                </a>
              </dt>
              <dd>{{ snapshotSummary() }}</dd>
            </div>
            <div>
              <dt>
                <a
                  routerLink="/reading-level"
                  fragment="grammar"
                  [queryParams]="{ from: 'generate' }"
                  [state]="generateOriginState"
                >
                  Grammar
                </a>
              </dt>
              <dd>{{ presetName() }}</dd>
            </div>
          </dl>
        </div>
      </aside>
    </div>

    <div class="action-bar mn-stack">
      <div class="mn-actions">
        <button
          type="button"
          class="mn-button mn-button--primary"
          data-testid="generate"
          [disabled]="disabled() || !canGenerate()"
          [attr.aria-describedby]="!canGenerate() ? 'mn-generate-disabled-reason' : null"
          (click)="generate.emit()"
        >
          <mn-icon name="generate" [size]="18" />
          <span>Generate story</span>
        </button>
      </div>
      @if (!canGenerate() && disabledReason()) {
        <!-- The panel above already says this on screen; this is the button's description. -->
        <p id="mn-generate-disabled-reason" class="mn-visually-hidden">{{ disabledReason() }}</p>
      }
      @if (atGenerationLimit()) {
        <p class="mn-hint" data-testid="generation-limit">
          Generation limit reached. This one can start when one finishes.
        </p>
      }
    </div>
  `,
  styles: `
    @use '../../../styles/breakpoints' as breakpoints;

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
      font-weight: var(--weight-semibold);
    }

    .composer-grid {
      display: grid;
      grid-template-columns: minmax(0, 1.85fr) minmax(17.5rem, 1fr);
      gap: var(--space-5);
      /* Each card is as tall as what is in it: stretching the shorter one left
         a third of a card empty below its last control. */
      align-items: start;
    }

    .text-fields textarea {
      background: var(--surface-panel);
    }

    .setting-heading {
      display: flex;
      gap: var(--space-3);
      align-items: baseline;
      justify-content: space-between;
    }

    .setting-heading label {
      font-weight: var(--weight-semibold);
    }

    output {
      color: var(--text-secondary);
      font-size: var(--text-sm);
      text-align: end;
    }

    .length-slider {
      width: calc(100% - 1.375rem);
      height: var(--touch-target);
      margin: 0 0.6875rem;
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
      border-radius: var(--radius-pill);
      appearance: none;
      background: var(--action-primary);
      box-shadow: var(--shadow-focus);
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
      width: 22px;
      height: 22px;
      border: 4px solid var(--surface-raised);
      border-radius: var(--radius-pill);
      background: var(--action-primary);
      box-shadow: var(--shadow-focus);
    }

    .length-slider:focus-visible {
      outline: 3px solid var(--focus-ring);
      outline-offset: 2px;
      border-radius: var(--radius-pill);
    }

    .word-selection {
      margin-top: var(--space-5);
      padding-top: var(--space-4);
      border-top: 1px solid var(--border-subtle);
    }

    .preparation-targets {
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

    @media (max-width: breakpoints.$wide-max) {
      .composer-grid {
        grid-template-columns: minmax(0, 1fr);
      }
    }

    .generation-sources {
      margin-top: var(--space-5);
      padding-top: var(--space-4);
      border-top: 1px solid var(--border-subtle);
    }

    /*
     * Generate belongs to the whole composer. It remains in document flow so
     * its prerequisite copy never covers the fields it explains.
     */
    .action-bar {
      position: sticky;
      z-index: 2;
      bottom: 0;
      width: 100%;
      margin-top: calc(var(--space-2) * -1);
      padding: var(--space-4) 0 calc(var(--space-3) + env(safe-area-inset-bottom, 0px));
      background: var(--surface-canvas-fade);
    }

    .action-bar > .mn-actions,
    .action-bar > .mn-actions > .mn-button {
      width: 100%;
    }
  `,
})
export class StoryFormComponent {
  readonly defaultFeedback = input('');
  readonly disabledReason = input('');
  protected readonly generateOriginState = navigationOriginState('/generate');
  protected readonly draft = inject(GenerationDraftStore);

  readonly canGenerate = input.required<boolean>();
  readonly disabled = input.required<boolean>();
  /** Whether enough stories are already being written that this one must wait. */
  readonly atGenerationLimit = input(false);
  readonly snapshotSummary = input.required<string>();
  readonly presetName = input.required<string>();
  readonly ankiWordPriorityMode = input<AnkiWordPriorityMode>('uniform');
  readonly recentFocusSize = input<RecentFocusSize>(DEFAULT_RECENT_FOCUS_SIZE);
  readonly vocabularyStrictness = input<VocabularyStrictness>('standard');
  readonly preparationTargets = input<readonly PreparationLayer[]>(['english', 'grammar']);
  readonly audioReadiness = input<ConfigurationReadiness>('incomplete');

  readonly generate = output<void>();
  readonly ankiWordPriorityModeChanged = output<AnkiWordPriorityMode>();
  readonly recentFocusSizeChanged = output<RecentFocusSize>();
  readonly vocabularyStrictnessChanged = output<VocabularyStrictness>();
  readonly preparationTargetsChanged = output<readonly PreparationLayer[]>();

  protected readonly focusSizes = RECENT_FOCUS_SIZES;
  protected readonly lengthOptions = STORY_SENTENCE_COUNTS;
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
  protected readonly premiseCounterVisible = computed(() =>
    this.counterVisible(this.draft.premiseLength(), this.draft.premiseLimit),
  );
  protected readonly instructionsCounterVisible = computed(() =>
    this.counterVisible(this.draft.instructionsLength(), this.draft.instructionsLimit),
  );
  protected readonly premiseDescriptionIds = computed(() => {
    const ids: string[] = [];
    if (this.premiseCounterVisible()) ids.push('mn-premise-count');
    if (this.premiseTooLong()) ids.push('mn-premise-limit');
    return ids.length > 0 ? ids.join(' ') : null;
  });
  protected readonly instructionsDescriptionIds = computed(() => {
    const ids: string[] = [];
    if (this.instructionsCounterVisible()) ids.push('mn-instructions-count');
    if (this.instructionsTooLong()) ids.push('mn-instructions-limit');
    return ids.length > 0 ? ids.join(' ') : null;
  });
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

  protected onRecentFocusSize(event: Event): void {
    const value = Number((event.target as HTMLSelectElement).value);
    if (isRecentFocusSize(value)) {
      this.recentFocusSizeChanged.emit(value);
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

  private counterVisible(length: number, limit: number): boolean {
    return length >= Math.ceil(limit * 0.8) || length > limit;
  }
}
