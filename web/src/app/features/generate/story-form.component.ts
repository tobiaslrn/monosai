import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
} from '@angular/core';
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
import { IconComponent } from '../../shared-ui/icon/icon.component';
import { PreparationTargetsComponent } from '../../shared-ui/preparation-targets/preparation-targets.component';
import { StoryDirectionComponent } from './story-direction.component';
import { StoryPlotsComponent } from './story-plots.component';

const LENGTH_LABELS = ['Tiny', 'Short', 'Medium', 'Long'] as const;

const STEP_NAMES = ['Words', 'Direction', 'Plot'] as const;

const STRICTNESS_LABELS: Readonly<Record<VocabularyStrictness, string>> = {
  relaxed: 'Relaxed',
  standard: 'Standard',
  strict: 'Strict',
};

/**
 * The story form, in three steps: the words a story may use, the direction it
 * should take, and the plot it is written from.
 *
 * The plot is the topic decision. Left to the story model, an open premise
 * converged on the same few beginner scenes; here the learner steers, code
 * rolls what was left open, a plot request drafts three different stories, and
 * the one picked becomes the premise (ADR 0080).
 *
 * There is deliberately no visible target-vocabulary list, no temperature
 * control, and no prompt editor: the vocabulary the story may use is decided by
 * what the learner has reviewed, and showing a target list would turn reading
 * into a checklist.
 *
 * Generate says a network request is about to happen and does not estimate a
 * price, because a number that is wrong is worse than no number.
 */
@Component({
  selector: 'mn-story-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    IconComponent,
    PreparationTargetsComponent,
    StoryDirectionComponent,
    StoryPlotsComponent,
  ],
  template: `
    <!--
      What is missing leads the form, in the document flow: it is why the
      button at the foot is disabled, so it is read before the fields are
      filled. Inside the sticky bar it rode up over the fields themselves.
    -->
    <ng-content select="[generation-blockers]" />

    <ol class="steps" aria-label="Steps" data-testid="wizard-steps">
      @for (name of stepNames; track name; let index = $index) {
        <li
          [class.is-done]="draft.step() > index + 1"
          [class.is-current]="draft.step() === index + 1"
          [attr.aria-current]="draft.step() === index + 1 ? 'step' : null"
        >
          <span class="step-mark" aria-hidden="true">
            @if (draft.step() > index + 1) {
              <mn-icon name="check" [size]="14" />
            } @else {
              {{ index + 1 }}
            }
          </span>
          <span>{{ name }}</span>
          @if (draft.step() > index + 1) {
            <span class="mn-visually-hidden">, done</span>
          }
        </li>
      }
    </ol>

    @switch (draft.step()) {
      @case (1) {
        <section class="mn-card mn-stack" aria-labelledby="mn-words-title">
          <h2 id="mn-words-title" class="mn-card-title" tabindex="-1" data-step-heading>Words</h2>

          <div class="mn-stack mn-stack--tight">
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

          <div class="length">
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

          <details class="mn-disclosure strictness">
            <summary>
              <span>Vocabulary strictness</span>
              <span class="summary-value" data-testid="strictness-value">
                {{ strictnessLabels[vocabularyStrictness()] }}
              </span>
            </summary>
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

          <ng-content select="[story-defaults]" />

          @if (defaultFeedback()) {
            <p class="mn-hint" role="status">{{ defaultFeedback() }}</p>
          }

          <dl class="mn-facts generation-sources" data-testid="form-sources">
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
        </section>
      }
      @case (2) {
        <mn-story-direction [disabled]="disabled()" />
      }
      @case (3) {
        <mn-story-plots [disabled]="disabled()" />
        <section class="mn-card" aria-label="After the story">
          <mn-preparation-targets
            legend="Prepare after generation"
            [targets]="preparationTargets()"
            [audioReadiness]="audioReadiness()"
            [disabled]="disabled()"
            (targetsChanged)="preparationTargetsChanged.emit($event)"
          />
        </section>
      }
    }

    <div class="action-bar mn-stack">
      <div class="mn-actions">
        @if (draft.step() < 3) {
          <button
            type="button"
            class="mn-button mn-button--primary"
            data-testid="wizard-next"
            [disabled]="disabled() || !canContinue()"
            [attr.aria-describedby]="!canContinue() ? 'mn-generate-disabled-reason' : null"
            (click)="next.emit()"
          >
            Next
          </button>
        } @else {
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
        }
      </div>
      @if (disabledReason()) {
        <!-- The panel above already says this on screen; this is the button's description. -->
        <p id="mn-generate-disabled-reason" class="mn-visually-hidden">{{ disabledReason() }}</p>
      }
      @if (draft.step() === 3 && atGenerationLimit()) {
        <p class="mn-hint" data-testid="generation-limit">
          Generation limit reached. This one can start when one finishes.
        </p>
      }
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }

    .steps {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: var(--space-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .steps li {
      display: flex;
      gap: var(--space-2);
      align-items: center;
      min-width: 0;
      padding-top: var(--space-2);
      border-top: 3px solid var(--border-subtle);
      color: var(--text-secondary);
      font-size: var(--text-sm);
      font-weight: var(--weight-semibold);
    }

    .steps li.is-done,
    .steps li.is-current {
      border-top-color: var(--action-primary);
    }

    .steps li.is-done {
      color: var(--text-primary);
    }

    .steps li.is-current {
      color: var(--action-primary-text);
    }

    .step-mark {
      display: inline-grid;
      flex: none;
      place-items: center;
      width: 1.5rem;
      height: 1.5rem;
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-pill);
      font-size: var(--text-xs);
    }

    .is-done .step-mark {
      border-color: var(--action-primary);
      background: var(--action-primary);
      color: var(--text-on-action);
    }

    .is-current .step-mark {
      border-color: var(--action-primary);
    }

    [data-step-heading]:focus {
      outline: none;
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

    .strictness {
      padding-top: var(--space-2);
      border-top: 1px solid var(--border-subtle);
    }

    .summary-value {
      margin-inline-start: auto;
      color: var(--text-secondary);
      font-size: var(--text-sm);
      font-weight: var(--weight-medium);
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

    .generation-sources {
      padding-top: var(--space-2);
    }

    /*
     * The step's one action belongs to the whole form. It remains in document
     * flow so its prerequisite copy never covers the fields it explains.
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
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  /** Whether the current step's Next can be pressed. */
  readonly canContinue = input.required<boolean>();
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

  readonly next = output<void>();
  readonly generate = output<void>();
  readonly ankiWordPriorityModeChanged = output<AnkiWordPriorityMode>();
  readonly recentFocusSizeChanged = output<RecentFocusSize>();
  readonly vocabularyStrictnessChanged = output<VocabularyStrictness>();
  readonly preparationTargetsChanged = output<readonly PreparationLayer[]>();

  protected readonly stepNames = STEP_NAMES;
  protected readonly strictnessLabels = STRICTNESS_LABELS;
  protected readonly focusSizes = RECENT_FOCUS_SIZES;
  protected readonly lengthOptions = STORY_SENTENCE_COUNTS;

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

  constructor() {
    // A new step is new content where the old one was, so focus moves to its
    // heading and the page starts at the top, as it would on a new page. The
    // first render is the page arriving and keeps the browser's own focus.
    let shownStep = this.draft.step();
    effect(() => {
      const step = this.draft.step();
      if (step === shownStep) {
        return;
      }
      shownStep = step;
      afterNextRender(
        () => {
          this.host.nativeElement
            .querySelector<HTMLElement>('[data-step-heading]')
            ?.focus({ preventScroll: true });
          const page = document.scrollingElement;
          if (page !== null) {
            page.scrollTop = 0;
          }
        },
        { injector: this.injector },
      );
    });
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
}
