import type { OnChanges, SimpleChanges } from '@angular/core';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NETWORK_STATUS } from '../../domain/platform/network-status.port';
import {
  GenerationDraftStore,
  type GenerationStep,
} from '../../application/generation/generation-draft.store';
import { StoryPlotStore } from '../../application/generation/story-plot.store';
import { PreparationStore } from '../../application/enrichment/preparation.store';
import { GenerationJobsStore } from '../../application/generation/generation-jobs.store';
import {
  allPrerequisitesMet,
  grammarPresetLine,
  prerequisiteChecks,
} from '../../application/generation/generation-prerequisites';
import type { GenerationState } from '../../application/generation/generation-state';
import type { PreparationLayer } from '../../domain/enrichment/preparation';
import { GrammarProfileStore } from '../../application/grammar/grammar-profile.store';
import { TextModelStore } from '../../application/settings/text-model.store';
import { ExceptionPolicyStore } from '../../application/settings/exception-policy.store';
import { GenerationSettingsStore } from '../../application/settings/generation-settings.store';
import { TtsStore } from '../../application/settings/tts.store';
import { AppSettingsStore } from '../../application/settings/app-settings.store';
import { SnapshotHistoryStore } from '../../application/vocabulary/snapshot-history.store';
import { SourceMappingStore } from '../../application/vocabulary/source-mapping.store';
import { jobId } from '../../domain/shared/ids';
import { formatCountOf } from '../../domain/shared/locale';
import {
  NavigationHistoryService,
  navigationOriginState,
} from '../../core/routing/navigation-history.service';
import { aiErrorAction, aiErrorCopy } from '../../shared-ui/ai-error/ai-error-copy';
import { ErrorScreenComponent } from '../../shared-ui/error-screen/error-screen.component';
import { PageHeaderComponent } from '../../shared-ui/page-header/page-header.component';
import { NotFoundPanelComponent } from '../../shared-ui/not-found/not-found-panel.component';
import { OutcomeComponent } from '../../shared-ui/outcome/outcome.component';
import { ButtonDirective } from '../../shared-ui/button/button';
import { ClusterComponent, PageComponent, StackComponent } from '../../shared-ui/layout/layout';
import { GenerationWaitComponent } from './generation-wait.component';
import { PrerequisitePanelComponent } from './prerequisite-panel.component';
import { StoryFormComponent } from './story-form.component';
import { ExceptionPolicyFieldComponent } from './exception-policy-field.component';

/**
 * How soon after one press's finger lifts the next finger-down still counts as
 * the second tap of a double tap. Android waits 300 ms for it, measured the
 * same way: from the first tap's release to the second tap's touch.
 */
const DOUBLE_TAP_MS = 300;

/** The controls a double tap must not carry from one step to the next. */
const STEP_CONTROLS =
  '[data-testid="wizard-next"], [data-testid="generate"], [data-testid="cancel-generation"], mn-page-header .back';

/** What the screen shows when it is not attached to a run. */
const IDLE: GenerationState = { kind: 'idle' };

/** The learner's words for the three aid layers, in `PREPARATION_ORDER`. */
const PREPARATION_LABELS: Readonly<Record<PreparationLayer, string>> = {
  english: 'English',
  grammar: 'grammar notes',
  audio: 'audio',
};

function formatList(items: readonly string[]): string {
  return items.length <= 1
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * The Generate screen: the form, and the progress of one running job.
 *
 * Runs live in the root `GenerationJobsStore`, not here, so leaving the screen
 * leaves the story being written. Which run this screen is showing comes from
 * the `:jobId` segment, so the library row for a background generation leads
 * back to exactly the run it started. The learner's typing lives in the
 * root-provided `GenerationDraftStore`, because every failed prerequisite links
 * to another screen and the draft has to survive that trip.
 */
@Component({
  selector: 'mn-generate-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    ErrorScreenComponent,
    GenerationWaitComponent,
    PageHeaderComponent,
    PrerequisitePanelComponent,
    StoryFormComponent,
    ExceptionPolicyFieldComponent,
    NotFoundPanelComponent,
    OutcomeComponent,
    ButtonDirective,
    PageComponent,
    StackComponent,
    ClusterComponent,
  ],
  template: `
    <mn-page>
      <mn-page-header
        [heading]="pageHeading()"
        backTo="/library"
        [backLabel]="backLabel()"
        [stepsBack]="stepsBack()"
        (backPressed)="stepBack()"
      />

      <p class="mn-visually-hidden" role="status" aria-live="polite" data-testid="generate-status">
        {{ announcement() }}
      </p>

      <!--
        Only while something is actually missing. A panel confirming a setup the
        learner finished long ago is a permanent header on a screen they came to
        write on.
      -->

      @if (missingJob()) {
        <!--
          A run only exists in the tab that started it, so a reload or a stale
          link arrives here with nothing to show. It says that, rather than
          quietly presenting an empty form as though nothing had been started.
        -->
        <mn-not-found-panel
          data-testid="missing-job"
          heading="This generation is no longer running"
          [explanation]="missingJobExplanation"
          primaryLink="/library"
          primaryLabel="Go to library"
          secondaryLink="/generate"
          secondaryLabel="Start a new story"
        />
      } @else if (savedReading(); as reading) {
        <mn-outcome
          mark="success"
          label="Saved story details"
          eyebrow="Saved to your library"
          [heading]="reading.title"
          headingLang="ja"
          headingTestId="saved-title"
        >
          @if (preparingLabel(); as label) {
            <p class="mn-hint" data-testid="saved-preparation">{{ label }}</p>
          }
          <a
            mn-outcome-action
            mnButton="primary"
            [routerLink]="['/reader', reading.id]"
            [replaceUrl]="true"
            [state]="navigation.preservedOriginState('/library')"
            data-testid="open-story"
            >Open story</a
          >
          <button
            mn-outcome-action
            mnButton
            type="button"
            data-testid="generate-another"
            (click)="retry()"
          >
            Generate another
          </button>
          <a mn-outcome-action mnButton routerLink="/library">Back to library</a>
        </mn-outcome>
      } @else if (isBusy()) {
        <mn-outcome
          variant="progress"
          label="Story generation progress"
          data-testid="generation-screen"
        >
          <mn-generation-wait [state]="state()" />
          <p class="mn-hint" data-testid="leave-hint">
            You can return to the library; generation continues.
          </p>
          @if (canCancel()) {
            <button
              mn-outcome-action
              mnButton
              type="button"
              data-testid="cancel-generation"
              (click)="cancel()"
            >
              Cancel
            </button>
          }
        </mn-outcome>
      } @else if (state().kind === 'cancelled') {
        <mn-outcome eyebrow="Nothing was saved" heading="Generation stopped">
          <button mn-outcome-action mnButton="primary" type="button" (click)="retry()">
            Back to the form
          </button>
          <a mn-outcome-action mnButton routerLink="/library">Back to library</a>
        </mn-outcome>
      } @else if (state().kind !== 'failed') {
        <!-- Plain: the form is the page, so a border around it encloses nothing. -->
        <section aria-labelledby="mn-generate-form-heading">
          <h2 id="mn-generate-form-heading" class="mn-visually-hidden">Your story</h2>
          <mn-story-form
            [canContinue]="canContinue()"
            [canGenerate]="canGenerate()"
            [disabledReason]="disabledReason()"
            [disabled]="isBusy()"
            [defaultFeedback]="defaultFeedback()"
            [atGenerationLimit]="!jobs.canStart()"
            [snapshotSummary]="snapshotSummary()"
            [presetName]="presetLine().presetName"
            [ankiWordPriorityMode]="appSettings.ankiWordPriorityMode()"
            (ankiWordPriorityModeChanged)="
              saveDefault(
                appSettings.setAnkiWordPriorityMode($event),
                appSettings.lastFailure,
                'Word selection'
              )
            "
            [recentFocusSize]="appSettings.recentFocusSize()"
            (recentFocusSizeChanged)="
              saveDefault(appSettings.setRecentFocusSize($event), appSettings.lastFailure, 'Focus')
            "
            [vocabularyStrictness]="generationSettings.vocabularyStrictness()"
            (vocabularyStrictnessChanged)="
              saveDefault(
                generationSettings.setVocabularyStrictness($event),
                generationSettings.failure,
                'Strictness'
              )
            "
            [preparationTargets]="generationSettings.defaultPreparationTargets()"
            [audioReadiness]="tts.readiness()"
            (preparationTargetsChanged)="
              saveDefault(
                generationSettings.setDefaultPreparationTargets($event),
                generationSettings.failure,
                'Preparation choices'
              )
            "
            (next)="next($event)"
            (generate)="generate($event)"
          >
            <mn-exception-policy-field story-defaults />
            @if (hasBlockers()) {
              <mn-prerequisite-panel
                generation-blockers
                [checks]="checks()"
                [preset]="presetLine()"
              />
            }
          </mn-story-form>
        </section>
      }

      @if (failureCopy(); as copy) {
        <mn-error-screen [heading]="copy.heading" [dataStatus]="copy.whatDidNot">
          <mn-stack data-actions [gap]="2">
            <p>{{ copy.primaryAction }}</p>
            <mn-cluster>
              @if (canRetrySave()) {
                <button
                  mnButton="primary"
                  type="button"
                  data-testid="retry-save"
                  (click)="retrySave()"
                >
                  Try saving again
                </button>
              }
              @if (needsStorageRecovery()) {
                <a
                  mnButton="primary"
                  routerLink="/settings"
                  [queryParams]="{ from: 'generate' }"
                  [state]="generateOriginState"
                >
                  Open storage settings
                </a>
              }
              @if (copy.primaryAction.includes('Settings') && !needsStorageRecovery()) {
                <!-- The action the sentence names, as the control that does it. -->
                <a
                  mnButton="primary"
                  [routerLink]="failureSettingsLink()"
                  [queryParams]="{ from: 'generate' }"
                  [state]="generateOriginState"
                  data-testid="failure-settings"
                >
                  Open Settings
                </a>
              }
              <button
                type="button"
                data-testid="dismiss-failure"
                [mnButton]="hasFailurePrimary(copy.primaryAction) ? '' : 'primary'"
                (click)="retry()"
              >
                Back to the form
              </button>
            </mn-cluster>
          </mn-stack>
        </mn-error-screen>
      }
    </mn-page>
  `,
})
export class GeneratePageComponent implements OnChanges {
  protected readonly defaultFeedback = signal('');
  private savesInFlight = 0;

  protected async saveDefault(
    work: Promise<void>,
    failure: () => { message: string } | null,
    label: string,
  ): Promise<void> {
    this.savesInFlight += 1;
    this.defaultFeedback.set('Saving default…');
    try {
      await work;
    } finally {
      this.savesInFlight -= 1;
    }
    // Saved is said once the last of overlapping saves has finished.
    if (this.savesInFlight === 0) {
      this.defaultFeedback.set(failure()?.message ?? `${label} saved as a default.`);
    }
  }

  /** The run this screen is showing, from `generate/:jobId`. */
  readonly jobId = input<string | undefined>(undefined);

  protected readonly jobs = inject(GenerationJobsStore);
  private readonly lane = inject(PreparationStore);
  protected readonly draft = inject(GenerationDraftStore);
  private readonly plots = inject(StoryPlotStore);
  protected readonly textModel = inject(TextModelStore);
  private readonly policy = inject(ExceptionPolicyStore);
  protected readonly appSettings = inject(AppSettingsStore);
  protected readonly generationSettings = inject(GenerationSettingsStore);
  protected readonly tts = inject(TtsStore);
  private readonly grammar = inject(GrammarProfileStore);
  private readonly snapshots = inject(SnapshotHistoryStore);
  private readonly network = inject(NETWORK_STATUS);
  private readonly router = inject(Router);
  protected readonly navigation = inject(NavigationHistoryService);
  protected readonly generateOriginState = navigationOriginState('/generate');

  /** A story is being started: its request is sent and the screen is moving on. */
  private starting = false;
  /** The last finger-down. */
  private touchedAt: { readonly time: number; readonly type: string } | null = null;

  /** The addressed job, or null on the plain form and after it has ended. */
  protected readonly job = computed(() => {
    const id = this.jobId();
    return id === undefined ? null : this.jobs.job(jobId(id));
  });

  /** A job was addressed and there is no such run in this tab. */
  protected readonly missingJob = computed(() => this.jobId() !== undefined && this.job() === null);

  protected readonly missingJobExplanation = ['It ended when the tab closed.'];

  protected readonly state = computed<GenerationState>(() => this.job()?.store.state() ?? IDLE);
  protected readonly isBusy = computed(() => this.job()?.store.isBusy() ?? false);
  protected readonly canCancel = computed(() => this.job()?.store.canCancel() ?? false);
  protected readonly announcement = computed(() => this.job()?.store.announcement() ?? '');

  protected readonly pageHeading = computed(() => {
    if (this.missingJob()) {
      return 'Generation not found';
    }
    switch (this.state().kind) {
      case 'idle':
        return 'Write with AI';
      case 'saved':
        return 'Your story is ready';
      case 'cancelled':
        return 'Generation stopped';
      case 'failed':
        return 'Story generation failed';
      default:
        return 'Creating your story';
    }
  });

  protected readonly checks = computed(() => {
    const failure = this.textModel.testFailure();
    return prerequisiteChecks({
      hasSources: this.wordSources.sources().length > 0,
      online: this.network.isOnline(),
      textModelFailure: failure === null ? null : aiErrorCopy(failure).heading,
      textModelReadiness: this.textModel.readiness(),
      structuredOutput: this.textModel.structuredOutput(),
      snapshot: this.snapshots.active(),
    });
  });

  protected readonly presetLine = computed(() =>
    grammarPresetLine(this.grammar.selectedPreset(), this.snapshots.active()),
  );
  private readonly wordSources = inject(SourceMappingStore);

  protected readonly snapshotSummary = computed(() => {
    const active = this.snapshots.active();
    return active === null
      ? 'No words yet'
      : formatCountOf(active.uniqueEntryCount, 'reviewed word');
  });

  /** The form, rather than a run, is what the screen is showing. */
  private readonly formShown = computed(() => {
    const kind = this.state().kind;
    return !this.missingJob() && kind === 'idle';
  });

  /** Inside the form, Back goes up one step; from the words, to the library. */
  protected readonly stepsBack = computed(() => this.formShown() && this.draft.step() > 1);
  protected readonly backLabel = computed(() => {
    if (!this.stepsBack()) {
      return 'Back to library';
    }
    return this.draft.step() === 3 ? 'Back to direction' : 'Back to words';
  });

  /**
   * Whether this step's Next can be pressed. Leaving the words costs nothing;
   * leaving the direction drafts plots, which is a request, so it waits on the
   * same prerequisites a story does.
   */
  protected readonly canContinue = computed(
    () =>
      !this.policy.isTooLong() &&
      (this.draft.step() === 1 || (allPrerequisitesMet(this.checks()) && this.draft.isValid())),
  );

  protected readonly canGenerate = computed(
    () =>
      !this.policy.isTooLong() &&
      allPrerequisitesMet(this.checks()) &&
      this.draft.isValid() &&
      this.jobs.canStart() &&
      this.plots.isReady(),
  );
  protected readonly disabledReason = computed(() => {
    const missing = this.checks()
      .filter((check) => !check.satisfied)
      .map((check) => check.detail)
      .join(' ');
    if (missing !== '' || this.draft.step() !== 3) {
      return missing;
    }
    if (this.plots.isDrafting()) {
      return 'Writing plots…';
    }
    if (this.plots.selected() === null) {
      // The draft failed before any plot existed; Regenerate asks again.
      return 'Regenerate the plots';
    }
    switch (this.plots.selectedIssue()) {
      case 'empty':
        return 'Write a plot';
      case 'too-long':
        return 'Shorten the plot';
      default:
        return '';
    }
  });

  /**
   * Whether anything is worth saying before the form. The advisory preset
   * warning counts: it is the one line here that costs money to ignore.
   */
  protected readonly hasBlockers = computed(
    () => !allPrerequisitesMet(this.checks()) || this.presetLine().warning !== null,
  );

  protected readonly savedReading = computed(() => {
    const state = this.state();
    return state.kind === 'saved' ? state.reading : null;
  });

  /**
   * What the lane is still making for the story, or null when nothing is.
   *
   * The story is in the library the moment its Japanese is valid; the layers it
   * declares are prepared afterwards and appear in the reader as they land, so
   * this says that rather than reporting counts that are all zero.
   */
  protected readonly preparingLabel = computed(() => {
    const reading = this.savedReading();
    if (reading === null) {
      return null;
    }
    const working = reading.preparationTargets.filter((target) => {
      const kind = this.lane.progressFor(reading.id, target).kind;
      return kind === 'queued' || kind === 'preparing' || kind === 'running';
    });
    const named = working.map((target) => PREPARATION_LABELS[target]);
    return named.length === 0 ? null : `Preparing ${formatList(named)}`;
  });

  /**
   * Provider failures get the shared AI copy; storage and language failures do
   * not, because their recovery is different and pretending otherwise would
   * tell a learner to change a model when their disk is full.
   */
  /** Whether the failure already offers a filled action, so Back stays the outline. */
  protected hasFailurePrimary(primaryAction: string): boolean {
    return this.canRetrySave() || this.needsStorageRecovery() || primaryAction.includes('Settings');
  }

  protected readonly failureCopy = computed(() => {
    const state = this.state();
    if (state.kind !== 'failed') {
      return null;
    }
    if (state.error.domain === 'storage' && state.error.code === 'migration-failed') {
      return {
        heading: 'Could not save',
        whatDidNot: 'Nothing was saved. Your data is unchanged.',
        primaryAction:
          'Close other Monosai tabs and reload. If it still fails, use Full reset in Storage settings.',
      };
    }
    return state.error.domain === 'ai'
      ? { ...aiErrorCopy(state.error), primaryAction: aiErrorAction(state.error, 'reader') }
      : {
          heading: 'Could not finish the story',
          whatDidNot: 'Nothing was saved.',
          primaryAction: 'Try again.',
        };
  });

  /** Where the failure is fixed: the key when it was refused, otherwise the text models. */
  protected readonly failureSettingsLink = computed(() => {
    const state = this.state();
    return state.kind === 'failed' &&
      state.error.domain === 'ai' &&
      state.error.code === 'authentication'
      ? '/settings'
      : '/settings/text-models';
  });

  protected readonly canRetrySave = computed(() => {
    const state = this.state();
    return (
      state.kind === 'failed' &&
      state.during === 'finalizing' &&
      (this.job()?.store.canRetrySave() ?? false)
    );
  });

  protected readonly needsStorageRecovery = computed(() => {
    const state = this.state();
    return (
      state.kind === 'failed' &&
      state.error.domain === 'storage' &&
      state.error.code === 'migration-failed'
    );
  });

  constructor() {
    void this.wordSources.load();
    void this.policy.load();
    void this.grammar.load();
    void this.snapshots.load();

    this.guardRepeatedPresses();
    inject(DestroyRef).onDestroy(() => {
      // Leaving no longer stops the run — that is the point. It only stops
      // being the watched one, and a story already saved has nothing left to
      // report from here.
      const id = this.jobId();
      if (id !== undefined) {
        this.jobs.release(jobId(id));
      }
    });
  }

  /**
   * Tells the registry which run has a screen, so a story that lands while the
   * learner is watching keeps its panel instead of being cleaned up the moment
   * it is saved.
   */
  ngOnChanges(changes: SimpleChanges): void {
    if ('jobId' in changes) {
      const id = this.jobId();
      this.jobs.watch(id === undefined ? null : jobId(id));
    }
  }

  /**
   * Starts a run and hands the screen over to it.
   *
   * The address is replaced rather than pushed: the form and the run it started
   * are one step in the learner's history, so Back from the wait screen goes
   * where they came from instead of to a form they have already submitted.
   */
  protected generate(shownStep: GenerationStep): void {
    if (shownStep !== this.draft.step() || this.starting) {
      return;
    }
    void this.startGeneration();
  }

  protected next(shownStep: GenerationStep): void {
    // A second tap during a slow navigation reaches the form again, now at the
    // words, so it waits for the story to be on its way.
    if (shownStep !== this.draft.step() || this.starting) {
      return;
    }
    void this.advance();
  }

  /**
   * Stops the second tap of a double tap from acting on the screen the first
   * one drew.
   *
   * The first tap redraws the screen and the second lands on whatever now sits
   * under the finger: Next for the following step, Back for the one before, or
   * the way out of the page. The browser's click count cannot tell it from a
   * new press on a phone, so a touch is judged by when the finger came down
   * against when the last press was released. Both are times the
   * input was made, so a slow main thread that handles them late does not
   * change the answer. A mouse repeat carries its count; a press with
   * neither, such as a keyboard or a screen reader, always acts.
   */
  private guardRepeatedPresses(): void {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const remember = (event: Event): void => {
      const touch = event as PointerEvent;
      this.touchedAt = { time: touch.timeStamp, type: touch.pointerType };
    };
    const judge = (event: Event): void => {
      const click = event as MouseEvent;
      if (!(click.target instanceof Element) || click.target.closest(STEP_CONTROLS) === null) {
        return;
      }
      const repeated = this.isRepeatedPress(click);
      // Every press starts the window, ignored ones included, so a burst of
      // taps counts as one press until the fingers pause.
      this.draft.lastStepPressAt = click.timeStamp;
      if (repeated) {
        click.stopPropagation();
        click.preventDefault();
      }
    };
    host.addEventListener('pointerdown', remember, true);
    host.addEventListener('click', judge, true);
    inject(DestroyRef).onDestroy(() => {
      host.removeEventListener('pointerdown', remember, true);
      host.removeEventListener('click', judge, true);
    });
  }

  private isRepeatedPress(click: MouseEvent): boolean {
    if (click.detail === 0) {
      return false;
    }
    const type =
      'pointerType' in click ? (click as PointerEvent).pointerType : this.touchedAt?.type;
    if (type === 'touch' || type === 'pen') {
      return (
        this.touchedAt !== null && this.touchedAt.time - this.draft.lastStepPressAt < DOUBLE_TAP_MS
      );
    }
    return click.detail > 1;
  }

  /**
   * Moves the form one step on; leaving the direction drafts the plots.
   *
   * Leaving
   * the words saves exceptions that were typed but not saved, and stays if the
   * save fails, rather than dropping the text from the story.
   */
  private async advance(): Promise<void> {
    if (!this.canContinue() || this.policy.action() !== 'idle') {
      return;
    }
    const step = this.draft.step();
    if (step === 1) {
      if (this.policy.hasUnsavedChanges() && !(await this.policy.save())) {
        return;
      }
      if (this.draft.step() === 1) {
        this.draft.setStep(2);
      }
    } else if (step === 2) {
      this.draft.setStep(3);
      void this.plots.prepare(this.draft.direction(), this.draft.specialInstructions());
    }
  }

  protected stepBack(): void {
    const step = this.draft.step();
    if (step > 1) {
      this.draft.setStep(step === 3 ? 2 : 1);
    }
  }

  private async startGeneration(): Promise<void> {
    // Set before anything can wait, and released on every way out, so a second
    // press cannot send a second paid request and a failed start can be tried
    // again.
    this.starting = true;
    try {
      await this.startStory();
    } finally {
      this.starting = false;
    }
  }

  private async startStory(): Promise<void> {
    if (this.draft.step() !== 3 || !this.canGenerate()) return;
    const chosen = this.plots.chosenPlot(this.draft.direction());
    if (chosen === null) return;
    const instructions = this.draft.specialInstructions();
    const started = this.jobs.start(
      this.draft.sentenceCount(),
      {
        premise: chosen.premise,
        chosenPlot: chosen.plot,
        ...(instructions.trim() === '' ? {} : { specialInstructions: instructions }),
      },
      this.textModel.activePresetId(),
    );
    if (started === null) {
      return;
    }
    // The next story starts from the words with the same choices. The sent
    // plot goes the next time plots are drafted; a run that writes nothing
    // hands it back from its own record.
    this.plots.spend();
    this.draft.storyStarted();
    await this.router.navigate(['/generate', started], {
      replaceUrl: true,
      ...this.navigation.preservedOrigin('/library'),
    });
  }

  protected cancel(): void {
    this.job()?.store.cancel();
  }

  protected async retrySave(): Promise<void> {
    await this.job()?.store.retrySave();
  }

  /** Returns to the form with the draft intact, ready for another attempt. */
  protected retry(): void {
    void this.endJobAndReturnToForm();
  }

  /**
   * Drops the finished run and puts the form back at the plain address.
   *
   * A run that wrote nothing hands its plots back at the step it left from, so
   * trying again is one press; a saved story starts the next one at the words.
   */
  private async endJobAndReturnToForm(): Promise<void> {
    const job = this.job();
    const kind = this.state().kind;
    if ((kind === 'cancelled' || kind === 'failed') && job?.chosenPlot !== undefined) {
      this.plots.restore(job.chosenPlot, this.draft.direction(), this.draft.specialInstructions());
      this.draft.setStep(3);
    }
    if (job !== null) {
      this.jobs.dismiss(job.id);
    }
    await this.router.navigate(['/generate'], {
      replaceUrl: true,
      ...this.navigation.preservedOrigin('/library'),
    });
  }
}
