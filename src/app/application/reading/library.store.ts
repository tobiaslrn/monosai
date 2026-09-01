import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import type { LibraryFilter, Reading } from '../../domain/reading/reading';
import type { ReadingId } from '../../domain/shared/ids';
import type { StorageError } from '../../domain/storage/storage-error';
import { formatCount } from '../../domain/shared/locale';
import { CLOCK, READING_REPOSITORY } from '../shared/repository-tokens';
import { ReadingMutationsService } from './reading-mutations.service';

/** Readings per library page. Pages are read newest first. */
export const LIBRARY_PAGE_SIZE = 12;

export type LibraryStatus = 'idle' | 'loading' | 'ready' | 'failed';

/**
 * The library list and its filter.
 *
 * Pages are read through the repository's bounded query, which returns only
 * `readings` rows: no sentences, token analyses, or audio blobs are touched to
 * render a card.
 */
@Injectable({ providedIn: 'root' })
export class LibraryStore {
  private readonly readings = inject(READING_REPOSITORY);
  private readonly clock = inject(CLOCK);
  private readonly mutations = inject(ReadingMutationsService);

  private readonly itemsSignal = signal<readonly Reading[]>([]);
  private readonly filterSignal = signal<LibraryFilter>('all');
  private readonly statusSignal = signal<LibraryStatus>('idle');
  private readonly hasMoreSignal = signal(false);
  private readonly loadingMoreSignal = signal(false);
  private readonly totalSignal = signal(0);
  private readonly errorSignal = signal<StorageError | null>(null);
  private readonly announcementSignal = signal('');

  readonly items = this.itemsSignal.asReadonly();
  readonly filter = this.filterSignal.asReadonly();
  readonly status = this.statusSignal.asReadonly();
  readonly hasMore = this.hasMoreSignal.asReadonly();
  readonly loadingMore = this.loadingMoreSignal.asReadonly();
  readonly totalReadings = this.totalSignal.asReadonly();
  readonly lastError = this.errorSignal.asReadonly();
  readonly announcement = this.announcementSignal.asReadonly();

  readonly isEmpty = computed(
    () => this.statusSignal() === 'ready' && this.itemsSignal().length === 0,
  );

  /** True only when the profile holds no readings at all, filter aside. */
  readonly hasNoReadings = computed(
    () => this.statusSignal() === 'ready' && this.totalSignal() === 0,
  );

  constructor() {
    // Another tab's deletion changes what this one is showing, so the shelf is
    // re-read rather than left describing rows that are gone. Reloading only
    // when the reading was actually on this page keeps a busy second tab from
    // re-querying for readings it never listed.
    const unsubscribe = this.mutations.onDeletedElsewhere((mutation) => {
      const listed = this.itemsSignal().find((reading) => reading.id === mutation.id);
      if (listed === undefined) {
        return;
      }
      // This tab's own copy of the title is preferred over the one that came
      // across the channel: it is the text the learner is looking at.
      void this.load().then(() => {
        this.announce(`${listed.title} was deleted in another tab.`);
      });
    });
    inject(DestroyRef).onDestroy(unsubscribe);
  }

  async load(): Promise<void> {
    this.statusSignal.set('loading');
    this.errorSignal.set(null);

    const total = await this.readings.countReadings('all');
    if (!total.ok) {
      this.fail(total.error);
      return;
    }
    this.totalSignal.set(total.value);

    const page = await this.readings.listLibraryPage({
      filter: this.filterSignal(),
      limit: LIBRARY_PAGE_SIZE,
    });
    if (!page.ok) {
      this.fail(page.error);
      return;
    }

    this.itemsSignal.set(page.value.items);
    this.hasMoreSignal.set(page.value.hasMore);
    this.statusSignal.set('ready');
  }

  async setFilter(filter: LibraryFilter): Promise<void> {
    if (filter === this.filterSignal()) {
      return;
    }
    this.filterSignal.set(filter);
    await this.load();
    this.announce(
      `${formatCount(this.itemsSignal().length)} readings shown${this.hasMoreSignal() ? ', more available' : ''}.`,
    );
  }

  /** Appends the next page, using the oldest loaded item as the cursor. */
  async loadMore(): Promise<void> {
    if (!this.hasMoreSignal() || this.loadingMoreSignal()) {
      return;
    }
    const items = this.itemsSignal();
    const oldest = items.at(-1);
    if (oldest === undefined) {
      return;
    }

    this.loadingMoreSignal.set(true);
    const page = await this.readings.listLibraryPage({
      filter: this.filterSignal(),
      limit: LIBRARY_PAGE_SIZE,
      createdBefore: oldest.createdAt,
    });
    this.loadingMoreSignal.set(false);

    if (!page.ok) {
      this.errorSignal.set(page.error);
      return;
    }
    this.itemsSignal.set([...items, ...page.value.items]);
    this.hasMoreSignal.set(page.value.hasMore);
  }

  /** Deletes a reading and reloads the current page. */
  async delete(id: ReadingId): Promise<boolean> {
    const title = await this.titleOf(id);
    const deleted = await this.readings.deleteReading(id);
    if (!deleted.ok) {
      this.errorSignal.set(deleted.error);
      this.announce(`${title} could not be deleted. Nothing was removed.`);
      return false;
    }
    await this.load();
    this.mutations.publishDeleted(id, title);
    this.announce(`${title} was deleted.`);
    return true;
  }

  /**
   * Announces something that happened to the shelf from outside it.
   *
   * The shelf owns the only live region on the Library, so a change made
   * somewhere else — another tab, another route — says itself here.
   */
  noteExternalChange(message: string): void {
    this.announce(message);
  }

  /**
   * The reading's title for use in a message about it.
   *
   * Read from the loaded page first; a reading deleted from the reader may
   * never have been listed in this tab, and "The reading was deleted" is the
   * last resort rather than the usual answer.
   */
  private async titleOf(id: ReadingId): Promise<string> {
    const listed = this.itemsSignal().find((reading) => reading.id === id);
    if (listed !== undefined) {
      return listed.title;
    }
    const stored = await this.readings.getReading(id);
    return stored.ok && stored.value !== null ? stored.value.title : 'The reading';
  }

  /** Records that a reading was opened. */
  async markOpened(id: ReadingId): Promise<void> {
    await this.readings.markOpened(id, this.clock.now());
  }

  private fail(error: StorageError): void {
    this.errorSignal.set(error);
    this.statusSignal.set('failed');
  }

  private announce(message: string): void {
    this.announcementSignal.set(message);
  }
}
