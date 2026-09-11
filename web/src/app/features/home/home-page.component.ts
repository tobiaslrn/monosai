import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { RouterLink } from '@angular/router';
import {
  GenerationJobsStore,
  type GenerationJob,
} from '../../application/generation/generation-jobs.store';
import { ContinueReadingStore } from '../../application/reading/continue-reading.store';
import { LibraryStore } from '../../application/reading/library.store';
import { MainNavComponent } from '../../core/layout/main-nav.component';
import { navigationOriginState } from '../../core/routing/navigation-history.service';
import { openConfirmDialog } from '../../shared-ui/confirm-dialog/confirm-dialog.component';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import { PageHeaderComponent } from '../../shared-ui/page-header/page-header.component';
import { ContinueReadingRowComponent } from './continue-reading-row.component';
import { GenerationJobCardComponent } from './generation-job-card.component';
import { HomeStandingComponent } from './home-standing.component';
import { HomeStatTilesComponent } from './home-stat-tiles.component';
import { HomeWelcomeComponent } from './home-welcome.component';
import {
  SAMPLE_READING_FIGURES,
  SAMPLE_READING_POSITION,
  sampleHeatLevels,
} from './sample-reading-progress';
import { StreakCalendarComponent } from './streak-calendar.component';

/**
 * Where Monosai opens: where the learner stands, and the two ways to start a
 * story, with whatever is still being written beneath them and, once a story
 * has been opened, the way back into it and how much has been read.
 */
@Component({
  selector: 'mn-home-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ContinueReadingStore],
  imports: [
    RouterLink,
    IconComponent,
    MainNavComponent,
    PageHeaderComponent,
    ContinueReadingRowComponent,
    GenerationJobCardComponent,
    HomeStandingComponent,
    HomeStatTilesComponent,
    HomeWelcomeComponent,
    StreakCalendarComponent,
  ],
  template: `
    <div class="mn-page home-page">
      <mn-page-header heading="Home" [home]="true">
        <mn-main-nav placement="top" />
        <a
          class="mn-icon-button"
          routerLink="/help"
          [state]="homeOriginState"
          aria-label="Help"
          title="Help"
        >
          <mn-icon name="help" />
        </a>
      </mn-page-header>

      <section class="home-hero" aria-labelledby="mn-page-title" [class.is-compact]="!isFirstRun()">
        <mn-home-standing />
        <div class="hero-art" aria-hidden="true">
          <img
            class="hero-art-light"
            src="assets/home-reader.png"
            alt=""
            width="1254"
            height="1254"
          />
          <img
            class="hero-art-dark"
            src="assets/home-reader-dark.png"
            alt=""
            width="1254"
            height="1254"
          />
        </div>
      </section>

      <div class="home-actions">
        <a class="mn-button mn-button--primary" routerLink="/generate" [state]="homeOriginState">
          <mn-icon name="generate" [size]="18" />
          <span>Write with AI</span>
        </a>
        <a class="mn-button" routerLink="/add" [state]="homeOriginState">
          <mn-icon name="add" [size]="18" />
          <span>Paste text</span>
        </a>
      </div>

      @if (generationJobs().length > 0) {
        <section class="home-group" aria-labelledby="home-group-writing">
          <h2 id="home-group-writing" class="mn-group-title">Being written</h2>
          <ul class="mn-list-group">
            @for (job of generationJobs(); track job.id) {
              <li>
                <mn-generation-job-card [job]="job" (dismissRequested)="confirmDismiss($event)" />
              </li>
            }
          </ul>
        </section>
      }

      @if (library.status() === 'failed') {
        <section class="mn-card" role="alert">
          <h2>Your library could not be loaded</h2>
          <p class="mn-hint">{{ library.lastError()?.message }}</p>
          <button type="button" class="mn-button" (click)="reload()">Try again</button>
        </section>
      } @else if (isFirstRun()) {
        <mn-home-welcome />
      } @else if (lastOpened(); as reading) {
        <!--
          Both groups wait until a story has been opened: sample figures beside
          nothing read would tell someone they have a streak they do not have.
        -->
        <section class="home-group" aria-labelledby="home-group-continue">
          <div class="group-head">
            <h2 id="home-group-continue" class="mn-group-title">Continue reading</h2>
            <span class="mn-status-pill mn-status-pill--warning">Sample</span>
          </div>
          <ul class="mn-list-group">
            <li>
              <mn-continue-reading-row [reading]="reading" [position]="samplePosition" />
            </li>
          </ul>
        </section>

        <section class="home-group" aria-labelledby="home-group-reading">
          <div class="group-head">
            <h2 id="home-group-reading" class="mn-group-title">Your reading</h2>
            <span class="mn-status-pill mn-status-pill--warning">Sample</span>
          </div>
          <mn-home-stat-tiles [figures]="sampleFigures" />
          <mn-streak-calendar [levels]="sampleHeat" [streakDays]="sampleFigures.streakDays" />
        </section>
      }

      <p class="mn-visually-hidden" role="status" aria-live="polite">
        {{ library.announcement() }}
      </p>
    </div>
  `,
  styles: `
    @use '../../../styles/breakpoints' as breakpoints;

    .home-page {
      gap: var(--space-4);
    }

    .home-hero {
      position: relative;
      isolation: isolate;
      display: flex;
      align-items: flex-start;
      min-height: 16rem;
      margin-bottom: calc(var(--space-2) * -1);
      padding-block: var(--space-2);
    }

    .hero-art {
      position: absolute;
      z-index: -1;
      inset: 0 0 auto auto;
      width: 55%;
      max-width: 16rem;
      aspect-ratio: 1;
      overflow: hidden;
      pointer-events: none;
    }

    .hero-art img {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    .hero-art-dark {
      display: none;
    }

    :host-context(html[data-theme='dark']) .hero-art-light {
      display: none;
    }

    :host-context(html[data-theme='dark']) .hero-art-dark {
      display: block;
    }

    @media (prefers-color-scheme: dark) {
      :host-context(html:not([data-theme='light'])) .hero-art-light {
        display: none;
      }

      :host-context(html:not([data-theme='light'])) .hero-art-dark {
        display: block;
      }
    }

    .home-hero mn-home-standing {
      width: 57%;
    }

    /*
     * Once there is a shelf, the hero steps back so what follows comes up the
     * screen. The art keeps its proportions; only its size changes.
     */
    .home-hero.is-compact {
      min-height: 10rem;
    }

    .home-hero.is-compact .hero-art {
      max-width: 10rem;
    }

    /*
     * Two direct ways in, side by side. Each track grows from its own label, so
     * the primary is the slightly wider one and neither label is squeezed; the
     * row only wraps when enlarged text leaves no room for both.
     */
    .home-actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }

    .home-actions .mn-button {
      flex: 1 1 auto;
    }

    .home-actions .mn-button--primary {
      flex-grow: 1.4;
    }

    .home-group {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      min-width: 0;
      padding-block-start: var(--space-2);
    }

    .group-head {
      display: flex;
      gap: var(--space-2);
      align-items: center;
      justify-content: space-between;
    }

    @media (max-width: breakpoints.$wide-max) {
      .home-hero {
        min-height: 12.5rem;
      }

      .home-hero mn-home-standing {
        width: 59%;
      }
    }
  `,
})
export class HomePageComponent {
  protected readonly library = inject(LibraryStore);
  private readonly jobs = inject(GenerationJobsStore);
  private readonly dialog = inject(Dialog);
  private readonly continueReading = inject(ContinueReadingStore);

  protected readonly homeOriginState = navigationOriginState('/home');
  protected readonly sampleFigures = SAMPLE_READING_FIGURES;
  protected readonly samplePosition = SAMPLE_READING_POSITION;
  protected readonly sampleHeat = sampleHeatLevels();

  protected readonly generationJobs = computed(() => this.jobs.libraryEntries());

  /**
   * The story opened most recently, or null. A lookup that failed shows
   * nothing: the row is a shortcut, and the Library still holds the story.
   */
  protected readonly lastOpened = computed(() => {
    const state = this.continueReading.state();
    switch (state.kind) {
      case 'ready':
        return state.reading;
      case 'loading':
      case 'none':
      case 'failed':
        return null;
    }
  });

  /**
   * Nothing saved and nothing being written: the screen a stranger lands on.
   *
   * `hasNoReadings` is false until the library has actually been read, so the
   * introduction cannot flash before the count answers.
   */
  protected readonly isFirstRun = computed(
    () => this.library.hasNoReadings() && this.generationJobs().length === 0,
  );

  constructor() {
    void this.library.load();
    void this.continueReading.load();
  }

  protected reload(): void {
    void this.library.load();
    void this.continueReading.load();
  }

  /**
   * Removes a generation's row.
   *
   * A run still working is confirmed first: dismissing it stops requests that
   * have already been paid for and produces nothing. A run that has stopped has
   * nothing left to lose, so its row goes without a question.
   */
  protected async confirmDismiss(job: GenerationJob): Promise<void> {
    if (job.store.isBusy()) {
      const confirmed = await openConfirmDialog(this.dialog, {
        title: 'Stop writing this story?',
        message: 'This cannot be undone. It permanently removes:',
        details: ['The story being written', 'The requests already spent on it'],
        footnote: 'Your vocabulary, grammar profile, and other stories are not affected.',
        confirmLabel: 'Stop and remove',
        cancelLabel: 'Keep writing',
        tone: 'danger',
      });
      if (!confirmed) {
        return;
      }
    }
    this.jobs.dismiss(job.id);
    this.library.noteExternalChange('The generation was removed. Nothing was saved.');
  }
}
