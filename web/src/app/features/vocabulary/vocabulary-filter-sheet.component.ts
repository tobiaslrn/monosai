import { ChangeDetectionStrategy, Component, inject, signal, viewChild } from '@angular/core';
import { DIALOG_DATA } from '@angular/cdk/dialog';
import { FormsModule } from '@angular/forms';
import { CLOCK } from '../../application/shared/repository-tokens';
import { ButtonDirective } from '../../shared-ui/button/button';
import { DialogComponent } from '../../shared-ui/dialog/dialog';
import {
  applyBrowseQuery,
  DEFAULT_BROWSE_QUERY,
  type BrowseQuery,
} from '../../domain/vocabulary/vocabulary-browse';
import { vocabularySourceId } from '../../domain/shared/ids';
import { formatCountOf } from '../../domain/shared/locale';
import type {
  CapturedSourceObservation,
  VocabularyEntry,
} from '../../domain/vocabulary/vocabulary-repository';

export interface VocabularyFilterSheetData {
  readonly query: BrowseQuery;
  readonly entries: readonly VocabularyEntry[];
  readonly sources: readonly CapturedSourceObservation[];
}

/** The Filters task dialog: a centred card on a wide screen, a docked sheet on a phone. */
@Component({
  selector: 'mn-vocabulary-filter-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ButtonDirective, DialogComponent],
  template: `
    <mn-dialog heading="Filters" headingId="vocabulary-filter-heading" closeLabel="Close filters">
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

      <fieldset>
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

      <button mn-dialog-action="start" mnButton="ghost" type="button" (click)="reset()">
        Reset
      </button>
      <button mn-dialog-action mnButton="primary" type="button" (click)="show()">
        Show {{ formatCountOf(matchCount(), 'word') }}
      </button>
    </mn-dialog>
  `,
})
export class VocabularyFilterSheetComponent {
  protected readonly data = inject<VocabularyFilterSheetData>(DIALOG_DATA);
  private readonly clock = inject(CLOCK);
  private readonly frame = viewChild.required(DialogComponent);
  protected readonly draft = signal<BrowseQuery>(this.data.query);

  protected readonly formatCountOf = formatCountOf;
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

  /**
   * Commits the draft. Dismissing the dialog any other way — its close, the
   * handle, the scrim, or Escape — discards it.
   */
  protected show(): void {
    this.frame().close(this.draft());
  }

  protected reset(): void {
    this.draft.set({ ...DEFAULT_BROWSE_QUERY, search: this.draft().search });
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
