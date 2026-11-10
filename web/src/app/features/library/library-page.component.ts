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
} from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { NavigationStart, Router, RouterLink } from '@angular/router';
import { LibraryScrollMemoryService } from '../../core/routing/library-scroll-memory.service';
import { navigationOriginState } from '../../core/routing/navigation-history.service';
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
import { ButtonDirective } from '../../shared-ui/button/button';
import { CardComponent } from '../../shared-ui/card/card.component';
import { ShelfHeadingComponent } from '../../shared-ui/group/shelf-heading.component';
import { HeroComponent } from '../../shared-ui/hero/hero.component';
import { ClusterComponent, PageComponent } from '../../shared-ui/layout/layout';
import {
  MenuComponent,
  MenuItemDirective,
  MenuTriggerDirective,
} from '../../shared-ui/menu/menu.component';
import {
  GenerationJobsStore,
  type GenerationJob,
} from '../../application/generation/generation-jobs.store';
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
    ButtonDirective,
    CardComponent,
    ClusterComponent,
    HeroComponent,
    IconComponent,
    MenuComponent,
    MenuItemDirective,
    MenuTriggerDirective,
    PageComponent,
    PageHeaderComponent,
    ShelfHeadingComponent,
    GenerationJobCardComponent,
    LibraryStandingComponent,
    LibraryWelcomeComponent,
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
        <mn-card heading="Your library could not be loaded" [level]="2" role="alert">
          <p class="mn-hint">{{ store.lastError()?.message }}</p>
          <mn-cluster>
            <button mnButton type="button" (click)="reload()">Try again</button>
          </mn-cluster>
        </mn-card>
      } @else {
        <mn-hero
          role="region"
          aria-labelledby="mn-page-title"
          lightSrc="assets/home-reader.png"
          darkSrc="assets/home-reader-dark.png"
          [artWidth]="1254"
          [artHeight]="1070"
          [compact]="!isFirstRun()"
        >
          <mn-library-standing />
        </mn-hero>

        <!--
          The action sits directly below the invitation it acts on. Generating
          is a branch of adding rather than a destination of its own: it
          produces the same thing by a different route, and giving it equal
          billing in a navigation bar was what made Monosai look like an AI
          tool with a reader attached.
        -->
        <button
          mnButton="primary"
          type="button"
          aria-haspopup="dialog"
          data-testid="new-story"
          [mnMenuTrigger]="newStory"
        >
          <mn-icon name="add" [size]="18" />
          <span>Create a new story</span>
        </button>
        <mn-menu #newStory="mnMenu" role="dialog" aria-label="New story">
          <a mnMenuItem routerLink="/add" [state]="libraryOriginState" (click)="newStory.hide()">
            <mn-icon name="add" />
            <span>Paste text</span>
          </a>
          <a
            mnMenuItem
            routerLink="/generate"
            [state]="libraryOriginState"
            (click)="newStory.hide()"
          >
            <mn-icon name="generate" />
            <span>Write with AI</span>
          </a>
        </mn-menu>

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
              heading="Story generations"
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
