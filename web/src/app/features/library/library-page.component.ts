import type { ElementRef, TemplateRef } from '@angular/core';
import { formatList, startSentence } from '../../domain/shared/locale';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ViewContainerRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { NavigationStart, Router, RouterLink } from '@angular/router';
import { LibraryScrollMemoryService } from '../../core/routing/library-scroll-memory.service';
import { LibraryStore } from '../../application/reading/library.store';
import { AudioPlaybackStore } from '../../application/audio/audio-playback.store';
import { AudioJobStore } from '../../application/enrichment/audio-job.store';
import { TranslationJobStore } from '../../application/enrichment/translation-job.store';
import { CLOCK } from '../../application/shared/repository-tokens';
import { describeDeletion } from '../../domain/reading/deletion-plan';
import type { LibraryFilter, Reading } from '../../domain/reading/reading';
import { openConfirmDialog } from '../../shared-ui/confirm-dialog/confirm-dialog.component';
import { openRenameDialog } from '../../shared-ui/rename-dialog/rename-dialog.component';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import { PopoverService } from '../../shared-ui/popover/popover.service';
import { ReaderPopoverComponent } from '../../shared-ui/popover/reader-popover.component';
import {
  GenerationJobsStore,
  type GenerationJob,
} from '../../application/generation/generation-jobs.store';
import { NewReadingMenuComponent } from './new-reading-menu.component';
import { GenerationJobCardComponent } from './generation-job-card.component';
import { groupLibraryReadings } from './library-date-groups';
import { LibraryStandingComponent } from './library-standing.component';
import { LibraryWelcomeComponent } from './library-welcome.component';
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
@Component({
  selector: 'mn-library-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    IconComponent,
    PageHeaderComponent,
    ReaderPopoverComponent,
    NewReadingMenuComponent,
    GenerationJobCardComponent,
    LibraryStandingComponent,
    LibraryWelcomeComponent,
    LibraryVirtualListComponent,
  ],
  template: `
    <div class="mn-page library-page">
      <mn-page-header heading="Library" [home]="true">
        <nav class="utilities" aria-label="Utilities">
          <a class="mn-icon-button" routerLink="/help" aria-label="Help" title="Help">
            <mn-icon name="help" />
          </a>
          <a class="mn-icon-button" routerLink="/settings" aria-label="Settings" title="Settings">
            <mn-icon name="settings" />
          </a>
        </nav>
      </mn-page-header>

      @if (store.status() === 'failed') {
        <section class="mn-card" role="alert">
          <h2>Your library could not be loaded</h2>
          <p class="mn-hint">{{ store.lastError()?.message }}</p>
          <button type="button" class="mn-button" (click)="reload()">Try again</button>
        </section>
      } @else {
        <section
          class="home-hero"
          aria-labelledby="mn-page-title"
          [class.is-compact]="!isFirstRun()"
        >
          <mn-library-standing />
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

        <div class="shelf-head">
          <button
            type="button"
            class="mn-button mn-button--primary"
            #newReading
            [attr.aria-expanded]="menuOpen()"
            aria-haspopup="dialog"
            (click)="openNewReading()"
          >
            <mn-icon name="add" [size]="18" />
            <span>Create a new story</span>
          </button>
        </div>

        @if (showsFilters()) {
          <div class="filters" role="group" aria-label="Filter stories">
            @for (option of filters; track option.value) {
              <button
                type="button"
                class="mn-button"
                [attr.aria-pressed]="store.filter() === option.value"
                (click)="setFilter(option.value)"
              >
                {{ option.label }}
              </button>
            }
          </div>
        }

        <!--
          Stories still being written sit above the shelf, in the same row
          shape, so starting one and leaving has a visible result and the
          layout does not move when the story arrives.
        -->
        @if (generationJobs().length > 0) {
          <section class="date-group" aria-labelledby="library-group-generating">
            <h2 id="library-group-generating" class="mn-group-title">Story generations</h2>
            <ul class="reading-list mn-list-group">
              @for (job of generationJobs(); track job.id) {
                <li>
                  <mn-generation-job-card [job]="job" (dismissRequested)="confirmDismiss($event)" />
                </li>
              }
            </ul>
          </section>
        }

        @if (isFirstRun()) {
          <mn-library-welcome />
        } @else if (store.isEmpty() && generationJobs().length === 0) {
          <p class="mn-hint">No {{ store.filter() }} stories yet.</p>
        } @else {
          <mn-library-virtual-list
            [groups]="readingGroups()"
            (deleteRequested)="confirmDelete($event)"
            (renameRequested)="promptRename($event)"
          />
        }
      }

      <p class="mn-visually-hidden" role="status" aria-live="polite">{{ store.announcement() }}</p>
    </div>

    <ng-template #newReadingMenu>
      <mn-reader-popover label="New story" (closed)="closeNewReading()">
        <mn-new-reading-menu (chosen)="closeNewReading()" />
      </mn-reader-popover>
    </ng-template>
  `,
  styles: `
    @use '../../../styles/breakpoints' as breakpoints;

    /* The home header, action, and every date group share the same rail. */
    .library-page {
      gap: var(--space-3);
    }

    .utilities {
      display: flex;
      gap: var(--space-1);
    }

    /*
     * The standing and the illustration are one composition, so each sits on
     * the other's axis: the sentence is centred in the hero and the picture is
     * centred in it too, rather than both hanging from the top edge and
     * drifting apart as the sentence grows a line.
     */
    .home-hero {
      position: relative;
      isolation: isolate;
      display: flex;
      align-items: center;
      min-height: 16rem;
      margin-bottom: calc(var(--space-2) * -1);
      padding-block: var(--space-2);
    }

    .hero-art {
      position: absolute;
      z-index: -1;
      inset-block: 0;
      inset-inline-end: 0;
      margin-block: auto;
      width: 55%;
      max-width: 16rem;
      height: auto;
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

    .home-hero mn-library-standing {
      width: 57%;
    }

    /*
     * Once there is a shelf, the hero steps back so the stories come up the
     * screen. The art keeps its proportions; only its size changes.
     */
    .home-hero.is-compact {
      min-height: 10rem;
    }

    .home-hero.is-compact .hero-art {
      max-width: 10rem;
    }

    /* The action sits directly below the invitation it acts on. */
    .shelf-head {
      display: block;
    }

    .shelf-head .mn-button {
      width: 100%;
    }

    .filters {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }

    .date-group {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      width: 100%;
      min-width: 0;
      padding-block-start: var(--space-2);
    }

    @media (max-width: breakpoints.$wide-max) {
      .home-hero {
        min-height: 12.5rem;
      }

      .home-hero mn-library-standing {
        width: 59%;
      }

      .filters {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
    }
  `,
})
export class LibraryPageComponent {
  protected readonly store = inject(LibraryStore);
  private readonly clock = inject(CLOCK);
  private readonly dialog = inject(Dialog);
  private readonly popover = inject(PopoverService);
  private readonly viewContainerRef = inject(ViewContainerRef);
  private restorationCancelled = false;
  private restorationPosition: number | null = null;
  private restorationFrame: number | null = null;
  private readonly translationJob = inject(TranslationJobStore);
  private readonly audioJob = inject(AudioJobStore);
  private readonly playback = inject(AudioPlaybackStore);
  private readonly scrollMemory = inject(LibraryScrollMemoryService);
  private readonly jobs = inject(GenerationJobsStore);

  private readonly newReading = viewChild<ElementRef<HTMLElement>>('newReading');
  private readonly newReadingMenu = viewChild.required<TemplateRef<unknown>>('newReadingMenu');

  protected readonly filters = FILTERS;

  private readonly menuOpenSignal = signal(false);
  protected readonly menuOpen = this.menuOpenSignal.asReadonly();

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
      }
    });
    this.restorationPosition = this.scrollMemory.take();
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
    destroyRef.onDestroy(() => {
      this.restorationCancelled = true;
      if (this.restorationFrame !== null) {
        cancelAnimationFrame(this.restorationFrame);
        this.restorationFrame = null;
      }
      navigationEvents.unsubscribe();
      this.popover.close();
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
    if (
      window.scrollY >= position ||
      !this.store.hasMore() ||
      this.store.loadMoreError() !== null
    ) {
      this.restorationPosition = null;
      return;
    }
    if (!this.store.loadingMore()) {
      void this.store.loadMore();
    }
  }

  /**
   * Anchored to the button on desktop and docked as a sheet on a phone, using
   * the same surface the reader's own popovers open in.
   */
  protected openNewReading(): void {
    const origin = this.newReading()?.nativeElement;
    if (origin === undefined) {
      return;
    }
    this.menuOpenSignal.set(true);
    this.popover.open({
      origin,
      template: this.newReadingMenu(),
      viewContainerRef: this.viewContainerRef,
      returnFocusTo: origin,
      onClosed: () => {
        this.menuOpenSignal.set(false);
      },
    });
  }

  protected closeNewReading(): void {
    this.popover.close();
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
    this.store.noteExternalChange('The generation was removed. Nothing was saved.');
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
      message: 'This cannot be undone. It permanently removes:',
      details: plan.removes,
      footnote: `${startSentence(formatList(plan.preserves))} are not affected.`,
      confirmLabel: 'Delete permanently',
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
      await this.store.delete(reading.id);
    }
  }
}
