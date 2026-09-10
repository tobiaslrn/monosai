import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { FormsModule } from '@angular/forms';
import { CLOCK } from '../../application/shared/repository-tokens';
import {
  applyBrowseQuery,
  DEFAULT_BROWSE_QUERY,
  type BrowseQuery,
} from '../../domain/vocabulary/vocabulary-browse';
import { vocabularySourceId } from '../../domain/shared/ids';
import type {
  CapturedSourceObservation,
  VocabularyEntry,
} from '../../domain/vocabulary/vocabulary-repository';

export interface VocabularyFilterSheetData {
  readonly query: BrowseQuery;
  readonly entries: readonly VocabularyEntry[];
  readonly sources: readonly CapturedSourceObservation[];
}

/** CDK dialog content used as a bottom sheet on narrow screens. */
@Component({
  selector: 'mn-vocabulary-filter-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <section class="sheet" aria-labelledby="vocabulary-filter-heading">
      <h2 id="vocabulary-filter-heading">Filters</h2>

      <label class="mn-field">
        <span>Source</span>
        <select
          class="mn-control"
          aria-label="Source"
          [ngModel]="draft().sourceId ?? ''"
          (ngModelChange)="setSource($event)"
        >
          <option value="">All sources</option>
          @for (source of data.sources; track source.sourceId) {
            <option [value]="source.sourceId">{{ source.label }}</option>
          }
        </select>
      </label>

      <fieldset class="difficulty">
        <legend>Difficulty</legend>
        <label class="mn-field">
          <span>Minimum difficulty: {{ draft().difficulty.min }}%</span>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            [value]="draft().difficulty.min"
            aria-label="Minimum difficulty"
            (input)="setMinimum(value($event))"
          />
        </label>
        <label class="mn-field">
          <span>Maximum difficulty: {{ draft().difficulty.max }}%</span>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            [value]="draft().difficulty.max"
            aria-label="Maximum difficulty"
            (input)="setMaximum(value($event))"
          />
        </label>
      </fieldset>

      <label class="mn-field">
        <span>First studied</span>
        <select
          class="mn-control"
          aria-label="First studied"
          [ngModel]="draft().firstStudied"
          (ngModelChange)="setFirstStudied($event)"
        >
          <option value="any">Any time</option>
          <option value="last-7-days">Last 7 days</option>
          <option value="last-30-days">Last 30 days</option>
          <option value="last-90-days">Last 90 days</option>
        </select>
      </label>

      <label class="mn-field">
        <span>Sort by</span>
        <select
          class="mn-control"
          aria-label="Sort by"
          [ngModel]="draft().sort"
          (ngModelChange)="setSort($event)"
        >
          <option value="first-studied-desc">First studied, newest</option>
          <option value="first-studied-asc">First studied, oldest</option>
          <option value="difficulty-desc">Difficulty, high to low</option>
          <option value="difficulty-asc">Difficulty, low to high</option>
          <option value="expression">Expression</option>
        </select>
      </label>

      <div class="actions">
        <button type="button" class="mn-button mn-button--primary" (click)="show()">
          Show {{ matchCount() }} words
        </button>
        <button type="button" class="mn-button mn-button--ghost" (click)="reset()">Reset</button>
      </div>
    </section>
  `,
  styles: `
    .sheet {
      display: grid;
      gap: var(--space-4);
      width: min(32rem, calc(100vw - 2 * var(--space-4)));
      max-height: min(90vh, 42rem);
      overflow: auto;
      padding: var(--space-5);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-card);
      background: var(--surface-panel);
      box-shadow: var(--shadow-overlay);
    }

    h2,
    fieldset {
      margin: 0;
    }

    h2 {
      font-size: var(--text-lg);
    }

    fieldset {
      display: grid;
      gap: var(--space-3);
      min-inline-size: 0;
      padding: 0;
      border: 0;
    }

    legend {
      margin-block-end: var(--space-2);
      font-weight: var(--weight-medium);
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-3);
      align-items: center;
      justify-content: space-between;
      margin-block-start: var(--space-2);
    }

    @media (max-width: 31.999em) {
      .sheet {
        width: 100%;
        max-height: 90vh;
        border-inline: 0;
        border-block-end: 0;
        border-radius: var(--radius-sheet) var(--radius-sheet) 0 0;
      }
    }
  `,
})
export class VocabularyFilterSheetComponent {
  protected readonly data = inject<VocabularyFilterSheetData>(DIALOG_DATA);
  private readonly dialogRef = inject<DialogRef<BrowseQuery | undefined>>(DialogRef);
  private readonly clock = inject(CLOCK);
  protected readonly draft = signal<BrowseQuery>(this.data.query);

  protected readonly matchCount = () =>
    applyBrowseQuery(this.data.entries, this.draft(), this.clock.now()).length;

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected setSource(value: string): void {
    this.update({ sourceId: value === '' ? null : vocabularySourceId(value) });
  }

  protected setMinimum(value: string): void {
    this.update({ difficulty: { min: Number(value), max: this.draft().difficulty.max } });
  }

  protected setMaximum(value: string): void {
    this.update({ difficulty: { min: this.draft().difficulty.min, max: Number(value) } });
  }

  protected setFirstStudied(value: string): void {
    this.update({ firstStudied: value as BrowseQuery['firstStudied'] });
  }

  protected setSort(value: string): void {
    this.update({ sort: value as BrowseQuery['sort'] });
  }

  protected show(): void {
    this.dialogRef.close(this.draft());
  }

  protected reset(): void {
    this.draft.set(DEFAULT_BROWSE_QUERY);
  }

  private update(patch: Partial<BrowseQuery>): void {
    const current = this.draft();
    const next: BrowseQuery = {
      ...current,
      ...patch,
      difficulty: { ...current.difficulty, ...(patch.difficulty ?? {}) },
    };
    const min = Number.isFinite(next.difficulty.min) ? next.difficulty.min : 0;
    const max = Number.isFinite(next.difficulty.max) ? next.difficulty.max : 100;
    this.draft.set({
      ...next,
      difficulty: min <= max ? { min, max } : { min: max, max: min },
    });
  }
}
