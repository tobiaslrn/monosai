import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { RouterLink } from '@angular/router';
import { LibraryStore } from '../../application/reading/library.store';
import { describeDeletion } from '../../domain/reading/deletion-plan';
import type { LibraryFilter, Reading } from '../../domain/reading/reading';
import { openConfirmDialog } from '../../shared-ui/confirm-dialog/confirm-dialog.component';
import { IconComponent } from '../../shared-ui/icon/icon.component';
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

/** Library: filters and the paginated reading list. */
@Component({
  selector: 'mn-library-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent, ReadingCardComponent],
  template: `
    <div class="mn-page">
      <header>
        <h1>Library</h1>
      </header>

      @if (store.status() === 'failed') {
        <section class="mn-panel" role="alert">
          <h2>Your library could not be loaded</h2>
          <p class="mn-hint">{{ store.lastError()?.message }}</p>
          <p class="mn-hint">Nothing was changed or deleted.</p>
          <button type="button" class="mn-button" (click)="reload()">Try again</button>
        </section>
      } @else {
        <div class="actions">
          <a class="mn-button mn-button--primary" routerLink="/add">
            <mn-icon name="add" [size]="18" />
            <span>Add text</span>
          </a>
          <a class="mn-button" routerLink="/generate">
            <mn-icon name="generate" [size]="18" />
            <span>Generate</span>
          </a>
        </div>

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

        @if (store.hasNoReadings()) {
          <section class="mn-panel empty">
            <h2>Nothing saved yet</h2>
            <p class="mn-hint">
              Add Japanese you already have, and read it with furigana, word lookup, and offline
              aids — no Anki connection or API key needed. Or connect Anki and an OpenRouter key,
              and generate a short story from the words you have already reviewed.
            </p>
            <div class="actions">
              <a class="mn-button mn-button--primary" routerLink="/add"
                >Add Japanese you already have</a
              >
              <a class="mn-button" routerLink="/generate">Generate from reviewed Anki vocabulary</a>
            </div>
          </section>
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

    .grid {
      display: grid;
      gap: var(--space-4);
      margin: 0;
      padding: 0;
      list-style: none;
    }

    @media (min-width: 720px) {
      .grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    .empty {
      align-items: flex-start;
    }
  `,
})
export class LibraryPageComponent {
  protected readonly store = inject(LibraryStore);
  private readonly dialog = inject(Dialog);

  protected readonly filters = FILTERS;

  constructor() {
    void this.store.load();
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
