import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  type OnDestroy,
} from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { Router, RouterLink } from '@angular/router';
import { GenerationDraftStore } from '../../application/generation/generation-draft.store';
import {
  allPrerequisitesMet,
  grammarPresetLine,
  prerequisiteChecks,
} from '../../application/generation/generation-prerequisites';
import { GenerationStore } from '../../application/generation/generation.store';
import { StoryAssemblyService } from '../../application/generation/story-assembly.service';
import { VocabularyPreparationService } from '../../application/generation/vocabulary-preparation.service';
import { GrammarProfileStore } from '../../application/grammar/grammar-profile.store';
import { CredentialStore } from '../../application/settings/credential.store';
import { TextModelStore } from '../../application/settings/text-model.store';
import { ExceptionPolicyStore } from '../../application/settings/exception-policy.store';
import { SnapshotHistoryStore } from '../../application/vocabulary/snapshot-history.store';
import { technicalCode } from '../../domain/shared/errors';
import {
  completionLabel,
  grammarLabel,
} from '../../shared-ui/reading-summary/reading-summary-labels';
import { aiErrorCopy, aiTaskCopy } from '../../shared-ui/ai-error/ai-error-copy';
import { openConfirmDialog } from '../../shared-ui/confirm-dialog/confirm-dialog.component';
import { ErrorScreenComponent } from '../../shared-ui/error-screen/error-screen.component';
import { PageHeaderComponent } from '../../shared-ui/page-header/page-header.component';
import { GenerationWaitComponent } from './generation-wait.component';
import { InvalidDraftComponent } from './invalid-draft.component';
import { PrerequisitePanelComponent } from './prerequisite-panel.component';
import { StoryFormComponent } from './story-form.component';

/**
 * The Generate screen.
 *
 * `GenerationStore` is provided here rather than at the root, so leaving the
 * screen discards whatever is in flight and no half-validated candidate can
 * survive a navigation. The learner's typing lives in the root-provided
 * `GenerationDraftStore` instead, because every failed prerequisite links to
 * another screen and the draft has to survive that trip.
 */
@Component({
  selector: 'mn-generate-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [GenerationStore, StoryAssemblyService, VocabularyPreparationService],
  imports: [
    RouterLink,
    ErrorScreenComponent,
    GenerationWaitComponent,
    InvalidDraftComponent,
    PageHeaderComponent,
    PrerequisitePanelComponent,
    StoryFormComponent,
  ],
  template: `
    <div class="mn-page">
      <mn-page-header [heading]="pageHeading()" backTo="/library" backLabel="Back to library" />

      <p class="mn-visually-hidden" role="status" aria-live="polite" data-testid="generate-status">
        {{ generation.announcement() }}
      </p>

      <!--
        Only while something is actually missing. A panel confirming a setup the
        learner finished long ago is a permanent header on a screen they came to
        write on.
      -->
      @if (state().kind === 'idle' && hasBlockers()) {
        <section class="mn-panel" aria-labelledby="mn-generate-checks-heading">
          <h2 id="mn-generate-checks-heading" class="mn-visually-hidden">Before you generate</h2>
          <mn-prerequisite-panel [checks]="checks()" [preset]="presetLine()" />
        </section>
      }

      @if (state().kind === 'invalid-draft') {
        <section class="mn-panel" aria-labelledby="mn-generate-draft-heading">
          <h2 id="mn-generate-draft-heading" class="mn-visually-hidden">Unsaved draft</h2>
          <mn-invalid-draft
            [draft]="invalidDraft()!"
            (tryAgain)="retry()"
            (changePremise)="changePremise()"
            (closeRequested)="confirmClose()"
          />
        </section>
      } @else if (savedReading(); as reading) {
        <section class="result-screen" aria-labelledby="mn-generate-saved-heading">
          <div class="ready-mark" aria-hidden="true">✓</div>
          <p class="eyebrow">Saved to your library</p>
          <h2 id="mn-generate-saved-heading">Your story is ready</h2>
          <p class="story-title" lang="ja" data-testid="saved-title">{{ reading.title }}</p>
          <ul class="summaries" data-testid="saved-summaries">
            <li>{{ translationSummaryLabel() }}</li>
            <li>{{ grammarSummaryLabel() }}</li>
          </ul>
          @if (hasMissingTranslations()) {
            <p class="mn-hint">
              Some sentences were not translated. The reader's status panel can translate the rest
              whenever you want them.
            </p>
          }
          <div class="actions">
            <a
              class="mn-button mn-button--primary"
              [routerLink]="['/reader', reading.id]"
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
      } @else if (generation.isBusy()) {
        <section
          class="wait-screen"
          aria-label="Story generation progress"
          data-testid="generation-screen"
        >
          <mn-generation-wait />
          @if (generation.canCancel()) {
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
            [disabled]="generation.isBusy()"
            [snapshotSummary]="snapshotSummary()"
            [presetName]="presetLine().presetName"
            (generate)="generate()"
          />
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
              <a class="mn-button mn-button--primary" routerLink="/settings">
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
export class GeneratePageComponent implements OnDestroy {
  protected readonly generation = inject(GenerationStore);
  protected readonly draft = inject(GenerationDraftStore);
  private readonly textModel = inject(TextModelStore);
  private readonly credential = inject(CredentialStore);
  private readonly policy = inject(ExceptionPolicyStore);
  private readonly grammar = inject(GrammarProfileStore);
  private readonly snapshots = inject(SnapshotHistoryStore);
  private readonly dialog = inject(Dialog);
  private readonly router = inject(Router);

  protected readonly state = this.generation.state;

  protected readonly pageHeading = computed(() => {
    switch (this.state().kind) {
      case 'idle':
        return 'Write with AI';
      case 'saved':
        return 'Your story is ready';
      case 'cancelled':
        return 'Generation stopped';
      case 'invalid-draft':
        return 'Unsaved story';
      case 'failed':
        return 'Story generation failed';
      default:
        return 'Creating your story';
    }
  });

  protected readonly checks = computed(() =>
    prerequisiteChecks({
      textModelReadiness: this.textModel.readiness(),
      structuredOutput: this.textModel.structuredOutput(),
      snapshot: this.snapshots.active(),
    }),
  );

  protected readonly presetLine = computed(() =>
    grammarPresetLine(this.grammar.selectedPreset(), this.snapshots.active()),
  );

  protected readonly snapshotSummary = computed(() => {
    const active = this.snapshots.active();
    return active === null
      ? 'vocabulary snapshot'
      : `${String(active.uniqueEntryCount)} reviewed words`;
  });

  protected readonly canGenerate = computed(
    () => allPrerequisitesMet(this.checks()) && this.draft.isValid(),
  );

  /**
   * Whether anything is worth saying before the form. The advisory preset
   * warning counts: it is the one line here that costs money to ignore.
   */
  protected readonly hasBlockers = computed(
    () => !allPrerequisitesMet(this.checks()) || this.presetLine().warning !== null,
  );

  protected readonly invalidDraft = computed(() => {
    const state = this.state();
    return state.kind === 'invalid-draft' ? state.draft : null;
  });

  protected readonly savedReading = computed(() => {
    const state = this.state();
    return state.kind === 'saved' ? state.reading : null;
  });

  /**
   * The saved story's auxiliary counts, worded exactly as the library card
   * words them, so the two places a learner sees them cannot disagree.
   */
  /** Whether the saved story is missing translations the reader can finish. */
  protected readonly hasMissingTranslations = computed(() => {
    const summary = this.savedReading()?.translationSummary;
    return summary !== undefined && summary.completed < summary.total;
  });

  protected readonly translationSummaryLabel = computed(() => {
    const reading = this.savedReading();
    return reading === null ? '' : completionLabel('Translations', reading.translationSummary);
  });

  protected readonly grammarSummaryLabel = computed(() => {
    const reading = this.savedReading();
    return reading === null ? '' : grammarLabel(reading.grammarSummary);
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
        escape: 'Full reset permanently deletes local readings, vocabulary, and settings.',
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
      state.kind === 'failed' && state.during === 'finalizing' && this.generation.canRetrySave()
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
    void this.credential.load();
    void this.textModel.load();
    void this.policy.load();
    void this.grammar.load();
    void this.snapshots.load();
  }

  ngOnDestroy(): void {
    // Leaving the screen abandons anything in flight; the typed draft survives.
    this.generation.dispose();
  }

  protected generate(): void {
    void this.generation.generate(this.draft.sentenceCount(), this.draft.input());
  }

  protected cancel(): void {
    this.generation.cancel();
  }

  protected async retrySave(): Promise<void> {
    await this.generation.retrySave();
  }

  /** Returns to the form with the draft intact, ready for another attempt. */
  protected retry(): void {
    this.generation.reset();
  }

  protected changePremise(): void {
    this.generation.reset();
  }

  /**
   * Closing an invalid draft loses it, so it is confirmed: there is no copy of
   * this Japanese anywhere else and no way to get the same one back.
   */
  protected async confirmClose(): Promise<void> {
    const confirmed = await openConfirmDialog(this.dialog, {
      title: 'Discard this draft?',
      message: 'The story was never saved, and closing loses it for good.',
      details: ['The Japanese shown here', 'The list of words that kept it out'],
      footnote: 'Your premise and instructions are kept.',
      confirmLabel: 'Discard the draft',
      cancelLabel: 'Keep looking at it',
      tone: 'danger',
    });
    if (confirmed) {
      this.generation.reset();
      await this.router.navigate(['/library']);
    }
  }
}
