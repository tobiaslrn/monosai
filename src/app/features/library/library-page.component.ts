import type { ElementRef, TemplateRef } from '@angular/core';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ViewContainerRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { RouterLink } from '@angular/router';
import { LibraryStore } from '../../application/reading/library.store';
import { describeDeletion } from '../../domain/reading/deletion-plan';
import type { LibraryFilter, Reading } from '../../domain/reading/reading';
import { openConfirmDialog } from '../../shared-ui/confirm-dialog/confirm-dialog.component';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import { PageHeaderComponent } from '../../shared-ui/page-header/page-header.component';
import { PopoverService } from '../../shared-ui/popover/popover.service';
import { ReaderPopoverComponent } from '../../shared-ui/popover/reader-popover.component';
import { NewReadingMenuComponent } from './new-reading-menu.component';
import { ReadingCardComponent } from './reading-card.component';

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
    ReadingCardComponent,
  ],
  template: `
    <div class="mn-page">
      <mn-page-header heading="Library">
        <a class="mn-icon-button" routerLink="/settings" aria-label="Settings">
          <mn-icon name="settings" [size]="20" />
        </a>
      </mn-page-header>

      @if (store.status() === 'failed') {
        <section class="mn-panel" role="alert">
          <h2>Your library could not be loaded</h2>
          <p class="mn-hint">{{ store.lastError()?.message }}</p>
          <p class="mn-hint">Nothing was changed or deleted.</p>
          <button type="button" class="mn-button" (click)="reload()">Try again</button>
        </section>
      } @else {
        <div class="actions">
          <button
            type="button"
            class="mn-button mn-button--primary"
            #newReading
            [attr.aria-expanded]="menuOpen()"
            aria-haspopup="dialog"
            (click)="openNewReading()"
          >
            <mn-icon name="add" [size]="18" />
            <span>New reading</span>
          </button>
        </div>

        @if (showsFilters()) {
          <div class="filters" role="group" aria-label="Filter readings">
            @for (option of filters; track option.value) {
              <button
                type="button"
                class="chip"
                [attr.aria-pressed]="store.filter() === option.value"
                [class.is-active]="store.filter() === option.value"
                (click)="setFilter(option.value)"
              >
                {{ option.label }}
              </button>
            }
          </div>
        }

        @if (store.hasNoReadings()) {
          <p class="mn-hint">Nothing saved yet.</p>
        } @else if (store.isEmpty()) {
          <p class="mn-hint">No {{ store.filter() }} readings yet.</p>
        } @else {
          <ul class="grid">
            @for (reading of store.items(); track reading.id) {
              <li>
                <mn-reading-card [reading]="reading" (deleteRequested)="confirmDelete($event)" />
              </li>
            }
          </ul>

          @if (store.hasMore()) {
            <button
              type="button"
              class="mn-button"
              [disabled]="store.loadingMore()"
              (click)="loadMore()"
            >
              {{ store.loadingMore() ? 'Loading…' : 'Show more' }}
            </button>
          }
        }
      }

      <p class="mn-visually-hidden" role="status" aria-live="polite">{{ store.announcement() }}</p>
    </div>

    <ng-template #newReadingMenu>
      <mn-reader-popover label="New reading">
        <mn-new-reading-menu (chosen)="closeNewReading()" />
      </mn-reader-popover>
    </ng-template>
  `,
  styles: `
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }

    .filters {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }

    .chip {
      min-height: var(--touch-target);
      padding: var(--space-2) var(--space-4);
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-pill);
      background: var(--surface-raised);
      color: var(--text-primary);
      font: inherit;
      cursor: pointer;
    }

    .chip.is-active {
      border-color: transparent;
      background: var(--action-primary);
      color: var(--text-on-action);
    }

    /*
     * Fills the width it is given rather than sitting as one narrow column on
     * the left, now that no sidebar takes the rest of the page.
     */
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: var(--space-4);
      margin: 0;
      padding: 0;
      list-style: none;
    }
  `,
})
export class LibraryPageComponent {
  protected readonly store = inject(LibraryStore);
  private readonly dialog = inject(Dialog);
  private readonly popover = inject(PopoverService);
  private readonly viewContainerRef = inject(ViewContainerRef);

  private readonly newReading = viewChild<ElementRef<HTMLElement>>('newReading');
  private readonly newReadingMenu = viewChild.required<TemplateRef<unknown>>('newReadingMenu');

  protected readonly filters = FILTERS;

  private readonly menuOpenSignal = signal(false);
  protected readonly menuOpen = this.menuOpenSignal.asReadonly();

  /** Chips are chrome until there are enough readings for filtering to help. */
  protected readonly showsFilters = computed(
    () => this.store.totalReadings() >= FILTER_VISIBILITY_THRESHOLD,
  );

  constructor() {
    void this.store.load();
    inject(DestroyRef).onDestroy(() => {
      this.popover.close();
    });
  }

  protected reload(): void {
    void this.store.load();
  }

  protected setFilter(filter: LibraryFilter): void {
    void this.store.setFilter(filter);
  }

  protected loadMore(): void {
    void this.store.loadMore();
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
   * Deletion states exactly what disappears and what survives before it is
   * permanent, because there is no backup and no undo.
   */
  protected async confirmDelete(reading: Reading): Promise<void> {
    const plan = describeDeletion(reading);
    const confirmed = await openConfirmDialog(this.dialog, {
      title: `Delete ${plan.title}?`,
      message: 'This cannot be undone. It permanently removes:',
      details: plan.removes,
      footnote: `${plan.preserves.join(', ')} are not affected.`,
      confirmLabel: 'Delete permanently',
      cancelLabel: 'Keep it',
      tone: 'danger',
    });
    if (confirmed) {
      await this.store.delete(reading.id);
    }
  }
}
