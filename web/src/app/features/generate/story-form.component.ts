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
import { navigationOriginState } from '../../core/routing/navigation-history.service';
import {
  GenerationDraftStore,
  type GenerationStep,
} from '../../application/generation/generation-draft.store';
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
import {
  RadioListComponent,
  type RadioListOption,
} from '../../shared-ui/radio-list/radio-list.component';
import { StoryDirectionComponent } from './story-direction.component';
import { StoryPlotsComponent } from './story-plots.component';
import { ActionBarComponent } from '../../shared-ui/action-bar/action-bar.component';
import { ButtonDirective } from '../../shared-ui/button/button';
import { CardComponent } from '../../shared-ui/card/card.component';
import { StackComponent } from '../../shared-ui/layout/layout';
import { NoticeComponent } from '../../shared-ui/notice/notice.component';
import { SettingsRowComponent } from '../../shared-ui/settings-row/settings-row.component';
import { RangeFieldComponent } from '../../shared-ui/range-field/range-field.component';
import {
  SelectComponent,
  type SelectOption,
  type SelectValue,
} from '../../shared-ui/select/select.component';
import { WizardStepsComponent } from '../../shared-ui/wizard-steps/wizard-steps.component';
import { WizardStepComponent } from '../../shared-ui/wizard-steps/wizard-step.component';

const LENGTH_LABELS = ['Tiny', 'Short', 'Medium', 'Long'] as const;

const STEP_NAMES = ['Words', 'Direction', 'Plot'] as const;

const STRICTNESS_LABELS: Readonly<Record<VocabularyStrictness, string>> = {
  relaxed: 'Relaxed',
  standard: 'Standard',
  strict: 'Strict',
};

const STRICTNESS_DESCRIPTIONS: Readonly<Record<VocabularyStrictness, string>> = {
  relaxed: 'Keep the first draft.',
  standard: 'Replace new words once',
  strict: 'Replace new words twice',
};

const STRICTNESS_OPTIONS: readonly SelectOption<VocabularyStrictness>[] = (
  Object.keys(STRICTNESS_LABELS) as VocabularyStrictness[]
).map((value) => ({
  value,
  label: STRICTNESS_LABELS[value],
  description: STRICTNESS_DESCRIPTIONS[value],
}));

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
    ActionBarComponent,
    ButtonDirective,
    CardComponent,
    IconComponent,
    NoticeComponent,
    PreparationTargetsComponent,
    RadioListComponent,
    RangeFieldComponent,
    SelectComponent,
    StackComponent,
    StoryDirectionComponent,
    StoryPlotsComponent,
    WizardStepComponent,
    WizardStepsComponent,
    SettingsRowComponent,
  ],
  template: `
    <!-- The form's blocks are the page's blocks, so they keep the page's rhythm. -->
    <mn-stack gap="page">
      <!--
        What is missing leads the form, in the document flow: it is why the
        button at the foot is disabled, so it is read before the fields are
        filled. Inside the sticky bar it rode up over the fields themselves.
      -->
      <ng-content select="[generation-blockers]" />

      <mn-wizard-steps
        label="Steps"
        data-testid="wizard-steps"
        [steps]="stepNames"
        [current]="draft.step()"
      />

      <mn-wizard-step [step]="draft.step()">
        @switch (draft.step()) {
          @case (1) {
            <mn-card heading="Words" [level]="2" [focusable]="true">
              <div class="mn-settings-group mn-settings-bleed">
                <mn-radio-list
                  label="Word selection"
                  testId="word-priority-select"
                  [options]="wordPriorityOptions"
                  [value]="ankiWordPriorityMode()"
                  [disabled]="disabled()"
                  (valueChange)="onWordPriorityMode($event)"
                />
                @if (ankiWordPriorityMode() === 'recent') {
                  <mn-settings-row label="Focus" labelId="mn-story-focus-label">
                    <mn-select
                      labelledBy="mn-story-focus-label"
                      testId="focus-size-select"
                      [options]="focusSizeOptions"
                      [value]="recentFocusSize()"
                      [disabled]="disabled()"
                      (valueChange)="onRecentFocusSize($event)"
                    />
                  </mn-settings-row>
                }
                <mn-range-field
                  label="Length"
                  testId="story-length"
                  [valueLabel]="lengthValueLabel()"
                  [max]="lengthOptions.length - 1"
                  [value]="selectedLengthIndex()"
                  [disabled]="disabled()"
                  [valueText]="lengthAriaValue()"
                  [describedBy]="lengthDescriptionIds()"
                  (valueChange)="onSentenceCount($event)"
                >
                  @if (showLengthWarning()) {
                    <mn-notice id="mn-length-warning" tone="warning" icon="warning" role="status">
                      Long stories may stray from your words.
                    </mn-notice>
                  }
                </mn-range-field>
                <mn-settings-row label="Vocabulary strictness" labelId="mn-story-strictness-label">
                  <mn-select
                    labelledBy="mn-story-strictness-label"
                    testId="strictness-select"
                    [options]="strictnessOptions"
                    [value]="vocabularyStrictness()"
                    [disabled]="disabled()"
                    (valueChange)="onVocabularyStrictness($event)"
                  />
                </mn-settings-row>
                <mn-settings-row
                  label="Vocabulary"
                  end="nav"
                  link="/reading-level"
                  fragment="words"
                  testId="form-vocabulary"
                  [summary]="snapshotSummary()"
                  [queryParams]="sourceQuery"
                  [state]="generateOriginState"
                />
                <mn-settings-row
                  label="Grammar"
                  end="nav"
                  link="/reading-level"
                  fragment="grammar"
                  testId="form-grammar"
                  [summary]="presetName()"
                  [queryParams]="sourceQuery"
                  [state]="generateOriginState"
                />
              </div>

              @if (defaultFeedback()) {
                <p class="mn-hint" role="status">{{ defaultFeedback() }}</p>
              }
            </mn-card>

            <ng-content select="[story-defaults]" />
          }
          @case (2) {
            <mn-story-direction [disabled]="disabled()" />
          }
          @case (3) {
            <mn-story-plots [disabled]="disabled()" />
            <mn-preparation-targets
              legend="Prepare after generation"
              [targets]="preparationTargets()"
              [audioReadiness]="audioReadiness()"
              [disabled]="disabled()"
              (targetsChanged)="preparationTargetsChanged.emit($event)"
            />
          }
        }
      </mn-wizard-step>

      <mn-action-bar>
        <!-- A press names the step this button was drawn for, not the step now. -->
        @let shownStep = draft.step();
        @if (shownStep < 3) {
          <button
            mnButton="primary"
            type="button"
            data-testid="wizard-next"
            [disabled]="disabled() || !canContinue()"
            [attr.aria-describedby]="!canContinue() ? 'mn-generate-disabled-reason' : null"
            (click)="next.emit(shownStep)"
          >
            Next
          </button>
        } @else {
          <button
            mnButton="primary"
            type="button"
            data-testid="generate"
            [disabled]="disabled() || !canGenerate()"
            [attr.aria-describedby]="!canGenerate() ? 'mn-generate-disabled-reason' : null"
            (click)="generate.emit(shownStep)"
          >
            <mn-icon name="generate" [size]="18" />
            <span>Generate story</span>
          </button>
        }
        @if (disabledReason()) {
          <!-- The panel above already says this on screen; this is the button's description. -->
          <p id="mn-generate-disabled-reason" class="mn-visually-hidden">{{ disabledReason() }}</p>
        }
        @if (draft.step() === 3 && atGenerationLimit()) {
          <p class="mn-hint" data-testid="generation-limit">
            Limit reached. This starts when another finishes.
          </p>
        }
      </mn-action-bar>
    </mn-stack>
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

  /** Where the vocabulary and grammar rows lead back from. */
  protected readonly sourceQuery = { from: 'generate' };
  readonly ankiWordPriorityMode = input<AnkiWordPriorityMode>('uniform');
  readonly recentFocusSize = input<RecentFocusSize>(DEFAULT_RECENT_FOCUS_SIZE);
  readonly vocabularyStrictness = input<VocabularyStrictness>('standard');
  readonly preparationTargets = input<readonly PreparationLayer[]>(['english', 'grammar']);
  readonly audioReadiness = input<ConfigurationReadiness>('incomplete');

  /** Both carry the step the pressed button was drawn for. */
  readonly next = output<GenerationStep>();
  readonly generate = output<GenerationStep>();
  readonly ankiWordPriorityModeChanged = output<AnkiWordPriorityMode>();
  readonly recentFocusSizeChanged = output<RecentFocusSize>();
  readonly vocabularyStrictnessChanged = output<VocabularyStrictness>();
  readonly preparationTargetsChanged = output<readonly PreparationLayer[]>();

  protected readonly stepNames = STEP_NAMES;
  protected readonly strictnessOptions = STRICTNESS_OPTIONS;
  protected readonly wordPriorityOptions: readonly RadioListOption<AnkiWordPriorityMode>[] = [
    {
      value: 'uniform',
      label: 'Evenly',
      description: 'All words equally',
    },
    {
      value: 'recent',
      label: 'Recently learned',
      description: 'Newest words first',
    },
    {
      value: 'difficult',
      label: 'Difficult',
      description: 'Words you struggle with',
    },
  ];
  protected readonly focusSizeOptions: readonly SelectOption<RecentFocusSize>[] =
    RECENT_FOCUS_SIZES.map((size) => ({ value: size, label: `Newest ${String(size)} words` }));
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

  protected readonly lengthValueLabel = computed(
    () => `${this.selectedLengthLabel()} · about ${String(this.draft.sentenceCount())} sentences`,
  );

  protected readonly lengthAriaValue = computed(
    () => `${this.selectedLengthLabel()}, ${String(this.draft.sentenceCount())} sentences`,
  );

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
            .querySelector<HTMLElement>('mn-card h2[tabindex]')
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

  protected onSentenceCount(index: number): void {
    const sentenceCount = STORY_SENTENCE_COUNTS.at(index);
    if (sentenceCount !== undefined) {
      this.draft.setSentenceCount(sentenceCount);
    }
  }

  protected onWordPriorityMode(value: SelectValue): void {
    if (value === 'uniform' || value === 'recent' || value === 'difficult') {
      this.ankiWordPriorityModeChanged.emit(value);
    }
  }

  protected onRecentFocusSize(value: SelectValue): void {
    if (typeof value === 'number' && isRecentFocusSize(value)) {
      this.recentFocusSizeChanged.emit(value);
    }
  }

  protected onVocabularyStrictness(value: SelectValue): void {
    if (value === 'relaxed' || value === 'standard' || value === 'strict') {
      this.vocabularyStrictnessChanged.emit(value);
    }
  }
}
