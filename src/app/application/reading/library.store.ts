import { Injectable, computed, inject, signal } from '@angular/core';
import type { ContinueReadingTarget } from '../../domain/reading/progress';
import { progressPercent } from '../../domain/reading/reading-position';
import type { LibraryFilter, Reading } from '../../domain/reading/reading';
import type { ReadingId } from '../../domain/shared/ids';
import type { StorageError } from '../../domain/storage/storage-error';
import { CLOCK, READING_REPOSITORY } from '../shared/repository-tokens';

/** Readings per library page. Pages are read newest first. */
export const LIBRARY_PAGE_SIZE = 12;

export type LibraryStatus = 'idle' | 'loading' | 'ready' | 'failed';

/**
 * The library list, its filter, and Continue reading.
 *
 * Pages are read through the repository's bounded query, which returns only
 * `readings` rows: no sentences, token analyses, or audio blobs are touched to
 * render a card.
 */
@Injectable({ providedIn: 'root' })
export class LibraryStore {
  private readonly readings = inject(READING_REPOSITORY);
  private readonly clock = inject(CLOCK);

  private readonly itemsSignal = signal<readonly Reading[]>([]);
  private readonly filterSignal = signal<LibraryFilter>('all');
  private readonly statusSignal = signal<LibraryStatus>('idle');
  private readonly hasMoreSignal = signal(false);
  private readonly loadingMoreSignal = signal(false);
  private readonly continueSignal = signal<ContinueReadingTarget | null>(null);
  private readonly totalSignal = signal(0);
  private readonly errorSignal = signal<StorageError | null>(null);
  private readonly announcementSignal = signal('');

  readonly items = this.itemsSignal.asReadonly();
  readonly filter = this.filterSignal.asReadonly();
  readonly status = this.statusSignal.asReadonly();
  readonly hasMore = this.hasMoreSignal.asReadonly();
  readonly loadingMore = this.loadingMoreSignal.asReadonly();
  readonly continueTarget = this.continueSignal.asReadonly();
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

  readonly continuePercent = computed(() => {
    const target = this.continueSignal();
    if (target === null) {
      return 0;
    }
    return progressPercent(target.progress?.positionInReading ?? 0, target.sentenceCount);
  });

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

    const target = await this.readings.resolveContinueReading();
    if (!target.ok) {
      this.fail(target.error);
      return;
    }

    this.itemsSignal.set(page.value.items);
    this.hasMoreSignal.set(page.value.hasMore);
    this.continueSignal.set(target.value);
    this.statusSignal.set('ready');
  }

  async setFilter(filter: LibraryFilter): Promise<void> {
    if (filter === this.filterSignal()) {
      return;
    }
    this.filterSignal.set(filter);
    await this.load();
    this.announce(
      `${String(this.itemsSignal().length)} readings shown${this.hasMoreSignal() ? ', more available' : ''}.`,
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

  /**
   * Deletes a reading and reloads.
   *
   * Continue reading is derived rather than stored, so reloading is what repairs
   * the pointer when the deleted reading was the one it referred to.
   */
  async delete(id: ReadingId): Promise<boolean> {
    const title = this.itemsSignal().find((reading) => reading.id === id)?.title ?? 'The reading';
    const deleted = await this.readings.deleteReading(id);
    if (!deleted.ok) {
      this.errorSignal.set(deleted.error);
      this.announce(`${title} could not be deleted. Nothing was removed.`);
      return false;
    }
    await this.load();
    this.announce(`${title} was deleted.`);
    return true;
  }

  /** Records that a reading was opened, so Continue reading points at it. */
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
