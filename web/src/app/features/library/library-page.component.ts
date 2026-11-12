import { formatList, startSentence } from '../../domain/shared/locale';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Dialog } from '@angular/cdk/dialog';
import { NavigationStart, Router, RouterLink } from '@angular/router';
import { navigationOriginState } from '../../core/routing/navigation-history.service';
import { LibraryScrollMemoryService } from '../../core/routing/library-scroll-memory.service';
import { LibraryStore } from '../../application/reading/library.store';
import { SetupProgressStore } from '../../application/generation/setup-progress.store';
import { HelpIntroService } from '../../core/layout/help-intro.service';
import { AudioPlaybackStore } from '../../application/audio/audio-playback.store';
import { AudioJobStore } from '../../application/enrichment/audio-job.store';
import { TranslationJobStore } from '../../application/enrichment/translation-job.store';
import { CLOCK } from '../../application/shared/repository-tokens';
import { describeDeletion } from '../../domain/reading/deletion-plan';
import type { LibraryFilter, Reading } from '../../domain/reading/reading';
import { openConfirmDialog } from '../../shared-ui/confirm-dialog/confirm-dialog.component';
import { openRenameDialog } from '../../shared-ui/rename-dialog/rename-dialog.component';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import { ButtonDirective } from '../../shared-ui/button/button';
import { EmptyStateComponent } from '../../shared-ui/empty-state/empty-state.component';
import { ErrorScreenComponent } from '../../shared-ui/error-screen/error-screen.component';
import { ShelfHeadingComponent } from '../../shared-ui/group/shelf-heading.component';
import { HeroComponent } from '../../shared-ui/hero/hero.component';
import { ClusterComponent, PageComponent } from '../../shared-ui/layout/layout';
import {
  GenerationJobsStore,
  type GenerationJob,
} from '../../application/generation/generation-jobs.store';
import { GenerationJobCardComponent } from './generation-job-card.component';
import { groupLibraryReadings } from './library-date-groups';
import { LibraryStandingComponent } from './library-standing.component';
import { LibraryFirstStepsComponent } from './library-first-steps.component';
import { LibraryVirtualListComponent } from './library-virtual-list.component';
import { PageHeaderComponent } from '../../shared-ui/page-header/page-header.component';

interface FilterOption {
  readonly value: LibraryFilter;
  readonly label: string;
}

const FILTERS: readonly FilterOption[] = [
  { value: 'all', label: 'All' },
  { value: 'imported', label: 'Imported' },
  { value: 'generated', label: 'Generated' },
];

/**
 * How many readings a shelf has to hold before filtering it is worth a row of
 * controls. Below this the chips only ever hide one or two cards the learner
 * can already see.
 */
export const FILTER_VISIBILITY_THRESHOLD = 8;

/** The library: the shelf of readings, and the one way to add another. */
/** Frames the shelf's height must hold still before a position that cannot be reached is given up. */
const RESTORATION_SETTLED_FRAMES = 8;

@Component({
  selector: 'mn-library-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    RouterLink,
    ButtonDirective,
    EmptyStateComponent,
    ErrorScreenComponent,
    ClusterComponent,
    HeroComponent,
    IconComponent,
    PageComponent,
    PageHeaderComponent,
    ShelfHeadingComponent,
    GenerationJobCardComponent,
    LibraryStandingComponent,
    LibraryFirstStepsComponent,
    LibraryVirtualListComponent,
  ],
  template: `
    <mn-page>
      <mn-page-header heading="Library" [home]="true" [showAlpha]="true">
        <nav aria-label="Utilities">
          <mn-cluster [gap]="1">
            <a mnButton="icon" routerLink="/help" aria-label="Help" title="Help">
              <mn-icon name="help" />
            </a>
            <a mnButton="icon" routerLink="/settings" aria-label="Settings" title="Settings">
              <mn-icon name="settings" />
            </a>
          </mn-cluster>
        </nav>
      </mn-page-header>

      @if (store.status() === 'failed') {
        <mn-error-screen
          heading="Your library could not be loaded"
          [description]="store.lastError()?.message ?? 'It could not be read from this device.'"
          dataStatus="Your saved stories have not been changed."
        >
          <ng-container data-actions>
            <button mnButton="primary" type="button" (click)="reload()">Try again</button>
          </ng-container>
        </mn-error-screen>
      } @else {
        <mn-hero
          role="region"
          aria-labelledby="mn-page-title"
          lightSrc="assets/home-reader.png"
          darkSrc="assets/home-reader-dark.png"
          [artWidth]="1254"
          [artHeight]="1070"
          [compact]="isStanding()"
        >
          <mn-library-standing [firstVisit]="isFirstRun()" [compact]="isStanding()" />
        </mn-hero>

        @if (showsFirstSteps()) {
          <!--
            Nothing saved and nothing can be written yet: the first steps are
            the way in, and their next step is the screen's one primary action.
          -->
          <mn-library-first-steps />
        } @else if (!isFirstRun()) {
          <!--
            The action sits directly below the invitation it acts on. Generating
            is a branch of adding rather than a destination of its own: it
            produces the same thing by a different route, and giving it equal
            billing in a navigation bar was what made Monosai look like an AI
            tool with a reader attached.
          -->
          <ng-container [ngTemplateOutlet]="ways" />
        }

        @if (showsFilters()) {
          <mn-cluster fill="narrow" role="group" aria-label="Filter stories">
            @for (option of filters; track option.value) {
              <button
                mnButton
                type="button"
                [attr.aria-pressed]="store.filter() === option.value"
                (click)="setFilter(option.value)"
              >
                {{ option.label }}
              </button>
            }
          </mn-cluster>
        }

        <!--
          Stories still being written sit above the shelf, in the same row
          shape, so starting one and leaving has a visible result and the
          layout does not move when the story arrives.
        -->
        @if (generationJobs().length > 0) {
          <section data-testid="date-group" aria-labelledby="library-group-generating">
            <mn-shelf-heading
              heading="Writing"
              headingId="library-group-generating"
              [first]="true"
            />
            <ul class="mn-list-group">
              @for (job of generationJobs(); track job.id) {
                <li>
                  <mn-generation-job-card [job]="job" (dismissRequested)="confirmDismiss($event)" />
                </li>
              }
            </ul>
          </section>
        }

        @if (isFirstRun()) {
          @if (!showsFirstSteps() && setup.known()) {
            <mn-empty-state data-testid="empty-shelf" heading="No stories yet">
              <ng-container data-actions>
                <ng-container [ngTemplateOutlet]="ways" />
              </ng-container>
            </mn-empty-state>
          }
        } @else if (store.isEmpty() && generationJobs().length === 0) {
          <mn-empty-state icon="search" [heading]="'No ' + store.filter() + ' stories yet'" />
        } @else {
          <mn-library-virtual-list
            [groups]="readingGroups()"
            [seedHeights]="seedHeights"
            (deleteRequested)="confirmDelete($event)"
            (renameRequested)="promptRename($event)"
          />
        }
      }

      <!--
        The two ways to start a story, side by side: write one with AI (the
        main way, three parts of the row) or paste Japanese text you already have. One template, so
        the shelf and the empty shelf cannot offer them differently.
      -->
      <ng-template #ways>
        <mn-cluster fill="split" role="group" aria-label="New story" data-testid="new-story">
          <a
            mnButton="primary"
            routerLink="/generate"
            [state]="libraryOriginState"
            data-testid="new-story-generate"
          >
            <mn-icon name="generate" />
            <span>Write with AI</span>
          </a>
          <a
            mnButton
            routerLink="/add"
            [state]="libraryOriginState"
            aria-label="Paste text"
            data-testid="new-story-paste"
          >
            <mn-icon name="add" />
            <span>Paste</span>
          </a>
        </mn-cluster>
      </ng-template>

      <p class="mn-visually-hidden" role="status" aria-live="polite">{{ store.announcement() }}</p>
    </mn-page>
  `,
})
export class LibraryPageComponent {
  protected readonly store = inject(LibraryStore);
  private readonly clock = inject(CLOCK);
  private readonly dialog = inject(Dialog);
  private readonly injector = inject(Injector);
  private restorationCancelled = false;
  private restorationPosition: number | null = null;
  private restorationFrame: number | null = null;
  private readonly shelf = viewChild(LibraryVirtualListComponent);
  protected seedHeights: ReadonlyMap<string, number> | null = null;
  private settledFrames = 0;
  private lastHeight = -1;
  private readonly translationJob = inject(TranslationJobStore);
  private readonly audioJob = inject(AudioJobStore);
  private readonly playback = inject(AudioPlaybackStore);
  private readonly scrollMemory = inject(LibraryScrollMemoryService);
  private readonly jobs = inject(GenerationJobsStore);

  protected readonly filters = FILTERS;
  protected readonly libraryOriginState = navigationOriginState('/library');

  /** Chips are chrome until there are enough readings for filtering to help. */
  protected readonly showsFilters = computed(
    () => this.store.totalReadings() >= FILTER_VISIBILITY_THRESHOLD,
  );
  /**
   * Nothing saved and nothing being written: the screen a stranger lands on.
   *
   * `hasNoReadings` is false until the shelf has actually been read, so the
   * welcome cannot flash before the library answers.
   */
  protected readonly isFirstRun = computed(
    () => this.store.hasNoReadings() && this.generationJobs().length === 0,
  );

  protected readonly setup = inject(SetupProgressStore);

  /**
   * Whether the hero is a standing line rather than the invitation: once a
   * story exists or could be written, the illustration steps down and the
   * headline takes the page-title size. Only a shelf still waiting on its
   * setup keeps the display hero.
   */
  protected readonly isStanding = computed(
    () => !this.isFirstRun() || (this.setup.known() && this.setup.complete()),
  );
  private readonly intro = inject(HelpIntroService, { optional: true });

  /**
   * An empty shelf on which nothing can be written yet. Waits for the words to
   * be read, so the steps never flash at a learner who is already set up.
   */
  protected readonly showsFirstSteps = computed(
    () => this.isFirstRun() && this.setup.known() && !this.setup.complete(),
  );

  protected readonly readingGroups = computed(() =>
    groupLibraryReadings(this.store.items(), this.clock.now()),
  );

  /**
   * The generations worth a row here. Every one of them would become a
   * generated story, so the Imported filter hides them rather than showing
   * rows the filter says are excluded.
   */
  protected readonly generationJobs = computed(() =>
    this.store.filter() === 'imported' ? [] : this.jobs.libraryEntries(),
  );

  constructor() {
    const destroyRef = inject(DestroyRef);
    const navigationEvents = inject(Router).events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        this.scrollMemory.remember(window.scrollY);
        const shelf = this.shelf();
        if (shelf !== undefined) {
          this.scrollMemory.rememberHeights(shelf.measuredHeights());
        }
      }
    });
    this.restorationPosition = this.scrollMemory.take();
    this.seedHeights = this.restorationPosition === null ? null : this.scrollMemory.takeHeights();
    effect(() => {
      const status = this.store.status();
      const loadingMore = this.store.loadingMore();
      const hasItems = this.store.items().length > 0;
      if (status !== 'ready' || loadingMore || !hasItems || this.restorationPosition === null) {
        return;
      }
      this.scheduleScrollRestoration();
    });
    void this.store.load();
    this.setup.load();
    // The first steps carry the guide in their own foot, so the page-top
    // offer of it would be the same thing twice.
    effect(() => {
      if (this.showsFirstSteps()) {
        this.intro?.absorb();
      }
    });
    // The learner taking over the scroll ends the restoration for good.
    const takeOver = (): void => {
      this.restorationPosition = null;
    };
    const takeOverEvents = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;
    for (const name of takeOverEvents) {
      window.addEventListener(name, takeOver, { passive: true });
    }
    destroyRef.onDestroy(() => {
      for (const name of takeOverEvents) {
        window.removeEventListener(name, takeOver);
      }
      this.restorationCancelled = true;
      if (this.restorationFrame !== null) {
        cancelAnimationFrame(this.restorationFrame);
        this.restorationFrame = null;
      }
      navigationEvents.unsubscribe();
    });
  }

  protected reload(): void {
    void this.store.load();
  }

  protected setFilter(filter: LibraryFilter): void {
    this.restorationPosition = null;
    void this.store.setFilter(filter);
  }

  /**
   * Rebuilds enough paged virtual space for a deep return from a reading.
   *
   * The first library page may not be tall enough for the saved window
   * position, so the browser clamps a one-shot scroll. Loading another page
   * and retrying after layout keeps the existing window-scroll restoration
   * meaningful without turning the library into an inner scrolling surface.
   */
  private scheduleScrollRestoration(): void {
    if (this.restorationFrame !== null || this.restorationCancelled) {
      return;
    }
    this.restorationFrame = requestAnimationFrame(() => {
      this.restorationFrame = null;
      this.tryScrollRestoration();
    });
  }

  private tryScrollRestoration(): void {
    const position = this.restorationPosition;
    if (position === null || this.restorationCancelled) {
      return;
    }
    if (this.store.status() !== 'ready') {
      return;
    }

    window.scrollTo(0, position);
    if (window.scrollY >= position) {
      this.finishScrollRestoration();
      return;
    }
    if (this.store.hasMore() && this.store.loadMoreError() === null) {
      this.settledFrames = 0;
      if (!this.store.loadingMore()) {
        void this.store.loadMore();
      }
      return;
    }
    // Everything is loaded, but rows that were only estimated are measured as
    // they mount, and the shelf grows under a position that was clamped to the
    // estimate. Keep going until the height stops changing.
    const height = document.documentElement.scrollHeight;
    this.settledFrames = height === this.lastHeight ? this.settledFrames + 1 : 0;
    this.lastHeight = height;
    if (this.settledFrames >= RESTORATION_SETTLED_FRAMES) {
      this.finishScrollRestoration();
      return;
    }
    this.scheduleScrollRestoration();
  }

  private finishScrollRestoration(): void {
    this.restorationPosition = null;
    this.settledFrames = 0;
    this.lastHeight = -1;
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
        message: 'This cannot be undone. It removes:',
        details: ['The story being written', 'The requests already spent on it'],
        footnote: 'Your words and other stories are not affected.',
        confirmLabel: 'Stop and remove',
        cancelLabel: 'Keep writing',
        tone: 'danger',
      });
      if (!confirmed) {
        return;
      }
    }
    this.jobs.dismiss(job.id);
    this.store.noteExternalChange('Removed. Nothing was saved.');
  }

  /**
   * Deletion states exactly what disappears and what survives before it is
   * permanent, because there is no backup and no undo.
   *
   * A job running for this reading is named in the confirmation and finalized
   * before the rows it writes to are removed, so nothing survives the delete
   * looking for them.
   */
  /**
   * Renaming touches the title and nothing else, so it needs no warning and no
   * confirmation beyond the learner pressing Save on what they typed.
   */
  protected async promptRename(reading: Reading): Promise<void> {
    const title = await openRenameDialog(this.dialog, { currentTitle: reading.title });
    if (title !== null && title !== reading.title) {
      await this.store.rename(reading.id, title);
    }
  }

  protected async confirmDelete(reading: Reading): Promise<void> {
    const plan = describeDeletion(reading, {
      translationRunning: this.translationJob.isRunningFor(reading.id),
      audioRunning: this.audioJob.isRunningFor(reading.id),
    });
    const confirmed = await openConfirmDialog(this.dialog, {
      title: `Delete ${plan.title}?`,
      message: 'This cannot be undone. It removes:',
      details: plan.removes,
      footnote: `${startSentence(formatList(plan.preserves))} are not affected.`,
      confirmLabel: 'Delete',
      cancelLabel: 'Keep it',
      tone: 'danger',
    });
    if (confirmed) {
      await Promise.all([
        this.translationJob.readingDeleted(reading.id),
        this.audioJob.readingDeleted(reading.id),
      ]);
      // The same call the reader makes before it navigates. Playback ends with
      // the reader now, so there is rarely a sound to stop from here — but the
      // store still holds this reading's refs and clip set, and a deleted
      // reading must not be what the next Play is pointed at.
      this.playback.readingDeleted(reading.id);
      const landing = this.rowToFocusAfterDelete(reading);
      const deleted = await this.store.delete(reading.id);
      if (!deleted) {
        return;
      }
      // The row that opened the menu is gone, and with it the focus the dialog
      // would have returned to. Wait for the shelf to render without it.
      afterNextRender(
        () => {
          this.focusAfterDelete(landing);
        },
        { injector: this.injector },
      );
    }
  }

  /** The key of the row after the one being deleted, or before it for the last row. */
  private rowToFocusAfterDelete(reading: Reading): string | null {
    const keys = [
      ...document.querySelectorAll<HTMLElement>('[data-virtual-key^="library-reading-"]'),
    ].map((element) => element.dataset['virtualKey'] ?? '');
    const index = keys.indexOf(`library-reading-${reading.id}`);
    if (index < 0) {
      return null;
    }
    return keys[index + 1] ?? keys[index - 1] ?? null;
  }

  private focusAfterDelete(key: string | null): void {
    const row =
      key === null
        ? null
        : document.querySelector<HTMLElement>(`[data-virtual-key="${key}"] [aria-haspopup="menu"]`);
    if (row !== null) {
      row.focus();
      return;
    }
    const heading = document.getElementById('mn-page-title');
    if (heading !== null) {
      heading.tabIndex = -1;
      heading.focus();
    }
  }
}
