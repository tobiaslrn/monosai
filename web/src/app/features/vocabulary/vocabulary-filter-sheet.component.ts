import { ChangeDetectionStrategy, Component, inject, signal, viewChild } from '@angular/core';
import { DIALOG_DATA } from '@angular/cdk/dialog';
import { FormsModule } from '@angular/forms';
import { CLOCK } from '../../application/shared/repository-tokens';
import { ButtonDirective } from '../../shared-ui/button/button';
import { DialogComponent } from '../../shared-ui/dialog/dialog';
import { SelectComponent, type SelectOption } from '../../shared-ui/select/select.component';
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
import { SettingsRowComponent } from '../../shared-ui/settings-row/settings-row.component';

@Component({
  selector: 'mn-vocabulary-filter-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ButtonDirective, DialogComponent, SelectComponent, SettingsRowComponent],
  template: `
    <mn-dialog heading="Filters" headingId="vocabulary-filter-heading" closeLabel="Close filters">
      <div class="mn-settings-group mn-settings-bleed">
        <mn-settings-row label="Source" labelId="mn-filter-1-label">
          <mn-select
            labelledBy="mn-filter-1-label"
            label="Source"
            [options]="sourceOptions"
            [ngModel]="draft().sourceId ?? ''"
            (ngModelChange)="setSource($event)"
          />
        </mn-settings-row>
      </div>

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

      <div class="mn-settings-group mn-settings-bleed">
        <mn-settings-row label="First studied" labelId="mn-filter-2-label">
          <mn-select
            labelledBy="mn-filter-2-label"
            label="First studied"
            [options]="firstStudiedOptions"
            [ngModel]="draft().firstStudied"
            (ngModelChange)="setFirstStudied($event)"
          />
        </mn-settings-row>
      </div>

      <div class="mn-settings-group mn-settings-bleed">
        <mn-settings-row label="Sort by" labelId="mn-filter-3-label">
          <mn-select
            labelledBy="mn-filter-3-label"
            label="Sort by"
            [options]="sortOptions"
            [ngModel]="draft().sort"
            (ngModelChange)="setSort($event)"
          />
        </mn-settings-row>
      </div>

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

  protected readonly sourceOptions: readonly SelectOption<string>[] = [
    { value: '', label: 'All sources' },
    ...this.data.sources.map((source) => ({ value: source.sourceId, label: source.label })),
  ];
  protected readonly firstStudiedOptions: readonly SelectOption<string>[] = [
    { value: 'any', label: 'Any time' },
    { value: 'last-7-days', label: 'Last 7 days' },
    { value: 'last-30-days', label: 'Last 30 days' },
    { value: 'last-90-days', label: 'Last 90 days' },
  ];
  protected readonly sortOptions: readonly SelectOption<string>[] = [
    { value: 'first-studied-desc', label: 'First studied, newest' },
    { value: 'first-studied-asc', label: 'First studied, oldest' },
    { value: 'difficulty-desc', label: 'Difficulty, high to low' },
    { value: 'difficulty-asc', label: 'Difficulty, low to high' },
    { value: 'expression', label: 'Expression' },
  ];
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
