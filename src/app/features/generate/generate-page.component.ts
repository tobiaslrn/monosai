import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NETWORK_STATUS } from '../../domain/platform/network-status.port';
import { GenerationDraftStore } from '../../application/generation/generation-draft.store';
import { GenerationJobsStore } from '../../application/generation/generation-jobs.store';
import {
  allPrerequisitesMet,
  grammarPresetLine,
  prerequisiteChecks,
} from '../../application/generation/generation-prerequisites';
import type { GenerationState } from '../../application/generation/generation.store';
import type { PreparationLayer } from '../../domain/enrichment/preparation';
import { GrammarProfileStore } from '../../application/grammar/grammar-profile.store';
import { TextModelStore } from '../../application/settings/text-model.store';
import { ExceptionPolicyStore } from '../../application/settings/exception-policy.store';
import { GenerationSettingsStore } from '../../application/settings/generation-settings.store';
import { TtsStore } from '../../application/settings/tts.store';
import { AppSettingsStore } from '../../application/settings/app-settings.store';
import { SnapshotHistoryStore } from '../../application/vocabulary/snapshot-history.store';
import { SourceMappingStore } from '../../application/vocabulary/source-mapping.store';
import { technicalCode } from '../../domain/shared/errors';
import { jobId } from '../../domain/shared/ids';
import {
  NavigationHistoryService,
  navigationOriginState,
} from '../../core/routing/navigation-history.service';
import { aiErrorCopy, aiTaskCopy } from '../../shared-ui/ai-error/ai-error-copy';
import { ErrorScreenComponent } from '../../shared-ui/error-screen/error-screen.component';
import { PageHeaderComponent } from '../../shared-ui/page-header/page-header.component';
import { GenerationWaitComponent } from './generation-wait.component';
import { PrerequisitePanelComponent } from './prerequisite-panel.component';
import { StoryFormComponent } from './story-form.component';
import { ExceptionPolicyFieldComponent } from './exception-policy-field.component';

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
  ],
  template: `
    <div class="mn-page">
      <mn-page-header [heading]="pageHeading()" backTo="/library" backLabel="Back to library" />

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
        <section class="mn-panel" data-testid="missing-job">
          <h2>This generation is no longer running</h2>
          <p class="mn-hint">
            Stories are written in the tab you start them in, and reloading ends them. Nothing was
            saved.
          </p>
          <div class="actions">
            <a class="mn-button mn-button--primary" routerLink="/generate">Start a new story</a>
            <a class="mn-button" routerLink="/library">Back to library</a>
          </div>
        </section>
      } @else if (savedReading(); as reading) {
        <section class="result-screen" aria-label="Saved story details">
          <div class="ready-mark" aria-hidden="true">✓</div>
          <p class="eyebrow">Saved to your library</p>
          <p class="story-title" lang="ja" data-testid="saved-title">{{ reading.title }}</p>
          @if (preparingLabel(); as label) {
            <p class="mn-hint" data-testid="saved-preparation">{{ label }}</p>
          }
          <div class="actions">
            <a
              class="mn-button mn-button--primary"
              [routerLink]="['/reader', reading.id]"
              [replaceUrl]="true"
              [state]="navigation.preservedOriginState('/library')"
              data-testid="open-story"
              >Open story</a
            >
            <button
              type="button"
              class="mn-button"
              data-testid="generate-another"
              (click)="retry()"
            >
              Generate another
            </button>
            <a class="mn-button" routerLink="/library">Back to library</a>
          </div>
        </section>
      } @else if (isBusy()) {
        <section
          class="wait-screen"
          aria-label="Story generation progress"
          data-testid="generation-screen"
        >
          <mn-generation-wait [state]="state()" />
          <p class="mn-hint leave-hint" data-testid="leave-hint">
            You can go back to your library while this is written. It keeps going, and the story
            appears when it is ready.
          </p>
          @if (canCancel()) {
            <button
              type="button"
              class="mn-button cancel"
              data-testid="cancel-generation"
              (click)="cancel()"
            >
              Cancel
            </button>
          }
        </section>
      } @else if (state().kind === 'cancelled') {
        <section class="result-screen" aria-labelledby="mn-generate-cancelled-heading">
          <p class="eyebrow">Nothing was saved</p>
          <h2 id="mn-generate-cancelled-heading">Generation stopped</h2>
          <p class="mn-hint">Your premise and instructions are still here.</p>
          <div class="actions">
            <button type="button" class="mn-button mn-button--primary" (click)="retry()">
              Back to the form
            </button>
            <a class="mn-button" routerLink="/library">Back to library</a>
          </div>
        </section>
      } @else if (state().kind !== 'failed') {
        <!-- Plain: the form is the page, so a border around it encloses nothing. -->
        <section class="mn-panel mn-panel--plain" aria-labelledby="mn-generate-form-heading">
          <h2 id="mn-generate-form-heading" class="mn-visually-hidden">Your story</h2>
          <mn-story-form
            [canGenerate]="canGenerate()"
            [disabledReason]="disabledReason()"
            [disabled]="isBusy()"
            [atGenerationLimit]="!jobs.canStart()"
            [snapshotSummary]="snapshotSummary()"
            [presetName]="presetLine().presetName"
            [ankiWordPriorityMode]="appSettings.ankiWordPriorityMode()"
            (ankiWordPriorityModeChanged)="appSettings.setAnkiWordPriorityMode($event)"
            [vocabularyStrictness]="generationSettings.vocabularyStrictness()"
            (vocabularyStrictnessChanged)="generationSettings.setVocabularyStrictness($event)"
            [preparationTargets]="generationSettings.defaultPreparationTargets()"
            [audioReadiness]="tts.readiness()"
            (preparationTargetsChanged)="generationSettings.setDefaultPreparationTargets($event)"
            (generate)="generate()"
          >
            <mn-exception-policy-field text-fields-extra />
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
        <mn-error-screen
          [heading]="copy.heading"
          [description]="copy.whatFailed"
          [dataStatus]="copy.whatDidNot"
          [code]="failureCode()"
        >
          <div data-actions class="recovery">
            <p data-testid="failure-context">{{ failureContext() }}</p>
            <p>{{ copy.primaryAction }}</p>
            <p class="mn-hint">{{ copy.escape }}</p>
            @if (canRetrySave()) {
              <button
                type="button"
                class="mn-button mn-button--primary"
                data-testid="retry-save"
                (click)="retrySave()"
              >
                Try saving again
              </button>
            }
            @if (needsStorageRecovery()) {
              <a
                class="mn-button mn-button--primary"
                routerLink="/settings"
                [queryParams]="{ from: 'generate' }"
                [state]="generateOriginState"
              >
                Open storage settings
              </a>
            }
            <button type="button" class="mn-button" data-testid="dismiss-failure" (click)="retry()">
              Back to the form
            </button>
          </div>
        </mn-error-screen>
      }
    </div>
  `,
  styleUrl: './generate-page.component.scss',
})
export class GeneratePageComponent {
  /** The run this screen is showing, from `generate/:jobId`. */
  readonly jobId = input<string | undefined>(undefined);

  protected readonly jobs = inject(GenerationJobsStore);
  protected readonly draft = inject(GenerationDraftStore);
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

  /** The addressed job, or null on the plain form and after it has ended. */
  protected readonly job = computed(() => {
    const id = this.jobId();
    return id === undefined ? null : this.jobs.job(jobId(id));
  });

  /** A job was addressed and there is no such run in this tab. */
  protected readonly missingJob = computed(() => this.jobId() !== undefined && this.job() === null);

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
      textModelFailure: failure === null ? null : aiErrorCopy(failure).whatFailed,
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
    return active === null ? 'No words yet' : `${String(active.uniqueEntryCount)} reviewed words`;
  });

  protected readonly canGenerate = computed(
    () => allPrerequisitesMet(this.checks()) && this.draft.isValid() && this.jobs.canStart(),
  );
  protected readonly disabledReason = computed(() =>
    this.checks()
      .filter((check) => !check.satisfied)
      .map((check) => check.detail)
      .join(' '),
  );

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
   * What is still being made for the story, or null when nothing was asked for.
   *
   * The story is in the library the moment its Japanese is valid; the layers it
   * declares are prepared afterwards and appear in the reader as they land, so
   * this says that rather than reporting counts that are all zero.
   */
  protected readonly preparingLabel = computed(() => {
    const targets = this.savedReading()?.preparationTargets ?? [];
    const named = targets.map((target) => PREPARATION_LABELS[target]);
    return named.length === 0 ? null : `Preparing ${formatList(named)}. You can start reading now.`;
  });

  /**
   * Provider failures get the shared AI copy; storage and language failures do
   * not, because their recovery is different and pretending otherwise would
   * tell a learner to change a model when their disk is full.
   */
  protected readonly failureCopy = computed(() => {
    const state = this.state();
    if (state.kind !== 'failed') {
      return null;
    }
    if (state.error.domain === 'storage' && state.error.code === 'migration-failed') {
      return {
        heading: 'Your local data needs attention',
        whatFailed: 'Monosai could not update the local database safely.',
        whatDidNot: 'Nothing new was saved. Existing data was not partially changed.',
        primaryAction:
          'Close other Monosai tabs and reload. If it still fails, use Full reset in Storage settings.',
        escape: 'Full reset permanently deletes local stories, vocabulary, and settings.',
      };
    }
    return state.error.domain === 'ai'
      ? aiErrorCopy(state.error)
      : {
          heading: 'The story could not be finished',
          whatFailed: state.error.message,
          whatDidNot: 'Nothing was saved. Your library and vocabulary are unchanged.',
          primaryAction: 'Try generating again.',
          escape: 'Reading and importing work without this.',
        };
  });

  protected readonly failureContext = computed(() => {
    const state = this.state();
    if (state.kind !== 'failed') {
      return '';
    }
    if (state.error.domain === 'ai') {
      return `This happened while ${aiTaskCopy(state.error.task)}.`;
    }
    return state.during === 'finalizing'
      ? 'This happened while saving your story.'
      : 'This happened while preparing your story.';
  });

  protected readonly failureCode = computed(() => {
    const state = this.state();
    return state.kind === 'failed' ? technicalCode(state.error) : null;
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

    // Tells the registry which run has a screen, so a story that lands while
    // the learner is watching keeps its panel instead of being cleaned up the
    // moment it is saved.
    effect(() => {
      const id = this.jobId();
      this.jobs.watch(id === undefined ? null : jobId(id));
    });
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
   * Starts a run and hands the screen over to it.
   *
   * The address is replaced rather than pushed: the form and the run it started
   * are one step in the learner's history, so Back from the wait screen goes
   * where they came from instead of to a form they have already submitted.
   */
  protected generate(): void {
    void this.startGeneration();
  }

  private async startGeneration(): Promise<void> {
    if (!this.canGenerate()) return;
    const started = this.jobs.start(
      this.draft.sentenceCount(),
      this.draft.input(),
      this.textModel.activePresetId(),
    );
    if (started === null) {
      return;
    }
    await this.router.navigate(['/generate', started], {
      replaceUrl: true,
      state: this.navigation.preservedOriginState('/library'),
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

  /** Drops the finished run and puts the form back at the plain address. */
  private async endJobAndReturnToForm(): Promise<void> {
    const job = this.job();
    if (job !== null) {
      this.jobs.dismiss(job.id);
    }
    await this.router.navigate(['/generate'], {
      replaceUrl: true,
      state: this.navigation.preservedOriginState('/library'),
    });
  }
}
