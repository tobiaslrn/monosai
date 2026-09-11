import { formatList, startSentence } from '../../domain/shared/locale';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
} from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { NavigationStart, Router } from '@angular/router';
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
import { groupLibraryReadings } from './library-date-groups';
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

/** The library: the shelf of saved readings. Starting a story is Home's. */
@Component({
  selector: 'mn-library-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, LibraryVirtualListComponent],
  template: `
    <div class="mn-page library-page">
      <mn-page-header heading="Library" backTo="/home" backLabel="Back to home" />

      @if (store.status() === 'failed') {
        <section class="mn-card" role="alert">
          <h2>Your library could not be loaded</h2>
          <p class="mn-hint">{{ store.lastError()?.message }}</p>
          <button type="button" class="mn-button" (click)="reload()">Try again</button>
        </section>
      } @else {
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

        @if (store.isEmpty()) {
          <p class="mn-hint">{{ emptyShelf() }}</p>
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
  `,
  styles: `
    @use '../../../styles/breakpoints' as breakpoints;

    /* The filters and every date group share the same rail. */
    .library-page {
      gap: var(--space-3);
    }

    .filters {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }

    @media (max-width: breakpoints.$wide-max) {
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
  private restorationCancelled = false;
  private restorationPosition: number | null = null;
  private restorationFrame: number | null = null;
  private readonly translationJob = inject(TranslationJobStore);
  private readonly audioJob = inject(AudioJobStore);
  private readonly playback = inject(AudioPlaybackStore);
  private readonly scrollMemory = inject(LibraryScrollMemoryService);

  protected readonly filters = FILTERS;

  protected readonly readingGroups = computed(() =>
    groupLibraryReadings(this.store.items(), this.clock.now()),
  );

  /** An empty shelf names the filter that emptied it, if any. */
  protected readonly emptyShelf = computed(() => {
    const filter = this.store.filter();
    return filter === 'all' ? 'No stories yet.' : `No ${filter} stories yet.`;
  });

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
   * Renaming touches the title and nothing else, so it needs no warning and no
   * confirmation beyond the learner pressing Save on what they typed.
   */
  protected async promptRename(reading: Reading): Promise<void> {
    const title = await openRenameDialog(this.dialog, { currentTitle: reading.title });
    if (title !== null && title !== reading.title) {
      await this.store.rename(reading.id, title);
    }
  }

  /**
   * Deletion states exactly what disappears and what survives before it is
   * permanent, because there is no backup and no undo.
   *
   * A job running for this reading is named in the confirmation and finalized
   * before the rows it writes to are removed, so nothing survives the delete
   * looking for them.
   */
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
