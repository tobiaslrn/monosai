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
import { CLOCK } from '../../application/shared/repository-tokens';
import { describeDeletion } from '../../domain/reading/deletion-plan';
import type { LibraryFilter, Reading } from '../../domain/reading/reading';
import { openConfirmDialog } from '../../shared-ui/confirm-dialog/confirm-dialog.component';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import { PopoverService } from '../../shared-ui/popover/popover.service';
import { ReaderPopoverComponent } from '../../shared-ui/popover/reader-popover.component';
import { NewReadingMenuComponent } from './new-reading-menu.component';
import { groupLibraryReadings } from './library-date-groups';
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
    ReaderPopoverComponent,
    NewReadingMenuComponent,
    ReadingCardComponent,
  ],
  template: `
    <div class="mn-page library-page">
      <header class="library-head">
        <div class="identity">
          <img class="mark" src="icons/icon-192.png" alt="" width="40" height="40" />
          <span class="wordmark">Monosai</span>
        </div>
        <a class="mn-icon-button" routerLink="/settings" aria-label="Settings">
          <mn-icon name="settings" [size]="20" />
        </a>
      </header>

      @if (store.status() === 'failed') {
        <section class="mn-panel" role="alert">
          <h2>Your library could not be loaded</h2>
          <p class="mn-hint">{{ store.lastError()?.message }}</p>
          <p class="mn-hint">Nothing was changed or deleted.</p>
          <button type="button" class="mn-button" (click)="reload()">Try again</button>
        </section>
      } @else {
        <div class="library-title-row">
          <h1>Library</h1>
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
          <section class="empty-state" aria-labelledby="mn-library-empty-heading">
            <h2 id="mn-library-empty-heading">Start with a reading</h2>
            <p class="mn-hint">
              Add Japanese you already have, or generate a story from reviewed Anki vocabulary.
            </p>
            <div class="empty-choices">
              <a class="empty-choice" routerLink="/add">
                <mn-icon name="add" [size]="20" />
                <span>
                  <strong>Add Japanese you already have</strong>
                  <small>Paste text and start reading.</small>
                </span>
              </a>
              <a class="empty-choice" routerLink="/generate">
                <mn-icon name="generate" [size]="20" />
                <span>
                  <strong>Generate from reviewed Anki vocabulary</strong>
                  <small>Choose a story setting and write with AI.</small>
                </span>
              </a>
            </div>
          </section>
        } @else if (store.isEmpty()) {
          <p class="mn-hint">No {{ store.filter() }} readings yet.</p>
        } @else {
          <div class="date-groups">
            @for (group of readingGroups(); track group.key) {
              <section class="date-group" [attr.aria-labelledby]="'library-group-' + group.key">
                <h2 [id]="'library-group-' + group.key">{{ group.label }}</h2>
                <ul class="reading-list">
                  @for (reading of group.readings; track reading.id) {
                    <li>
                      <mn-reading-card
                        [reading]="reading"
                        (deleteRequested)="confirmDelete($event)"
                      />
                    </li>
                  }
                </ul>
              </section>
            }
          </div>

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
    .library-page {
      max-width: 1120px;
      gap: var(--space-7);
      padding-top: var(--space-4);
    }

    .library-head {
      display: flex;
      gap: var(--space-4);
      align-items: center;
      justify-content: space-between;
      min-width: 0;
    }

    .identity {
      display: flex;
      gap: var(--space-3);
      align-items: center;
      min-width: 0;
    }

    .mark {
      flex: none;
      border-radius: 10px;
    }

    .wordmark {
      font-family: var(--font-ui);
      letter-spacing: -0.02em;
    }

    .wordmark {
      color: var(--text-primary);
      font-size: 24px;
      font-weight: 700;
      white-space: nowrap;
    }

    .library-title-row {
      display: flex;
      gap: var(--space-4);
      align-items: center;
      justify-content: space-between;
    }

    .library-title-row h1 {
      margin: 0;
      font-family: var(--font-ui);
      font-size: 28px;
      font-weight: 700;
      letter-spacing: -0.02em;
    }

    .filters {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      max-width: 42rem;
    }

    .empty-state h2 {
      margin: 0;
      font-size: var(--text-lg);
    }

    .empty-state .mn-hint {
      margin: 0;
    }

    .empty-choices {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--space-3);
    }

    .empty-choice {
      display: flex;
      gap: var(--space-3);
      align-items: flex-start;
      min-width: 0;
      padding: var(--space-3);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-card);
      background: var(--surface-raised);
      color: var(--text-primary);
      text-decoration: none;
    }

    .empty-choice:hover {
      border-color: var(--border-strong);
      background: var(--surface-sunken);
    }

    .empty-choice mn-icon {
      flex: none;
      color: var(--action-primary);
    }

    .empty-choice span {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
      min-width: 0;
    }

    .empty-choice strong {
      font-weight: 600;
    }

    .empty-choice small {
      color: var(--text-secondary);
      font-size: var(--text-sm);
      line-height: 1.45;
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

    .date-groups {
      display: flex;
      flex-direction: column;
      gap: var(--space-6);
    }

    .date-group h2 {
      margin: 0 0 var(--space-2);
      color: var(--text-secondary);
      font-size: var(--text-sm);
      font-weight: 600;
    }

    .reading-list {
      margin: 0;
      padding: 0;
      border-top: 1px solid var(--border-subtle);
      list-style: none;
    }

    @media (max-width: 959px) {
      .library-page {
        gap: var(--space-5);
      }

      .wordmark {
        font-size: 21px;
      }

      .library-title-row h1 {
        font-size: 24px;
      }
    }

    /*
     * At phone widths the mark already supplies the identity. Keeping both the
     * wordmark and destination would squeeze the destination and Settings
     * control for no navigational benefit.
     */
    @media (max-width: 479px) {
      .wordmark {
        display: none;
      }

      .identity {
        gap: var(--space-2);
      }

      .empty-choices {
        grid-template-columns: 1fr;
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

  private readonly newReading = viewChild<ElementRef<HTMLElement>>('newReading');
  private readonly newReadingMenu = viewChild.required<TemplateRef<unknown>>('newReadingMenu');

  protected readonly filters = FILTERS;

  private readonly menuOpenSignal = signal(false);
  protected readonly menuOpen = this.menuOpenSignal.asReadonly();

  /** Chips are chrome until there are enough readings for filtering to help. */
  protected readonly showsFilters = computed(
    () => this.store.totalReadings() >= FILTER_VISIBILITY_THRESHOLD,
  );
  protected readonly readingGroups = computed(() =>
    groupLibraryReadings(this.store.items(), this.clock.now()),
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
