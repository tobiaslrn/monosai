import { ChangeDetectionStrategy, Component, inject, signal, viewChild } from '@angular/core';
import { DIALOG_DATA } from '@angular/cdk/dialog';
import { FormsModule } from '@angular/forms';
import { CLOCK } from '../../application/shared/repository-tokens';
import { ButtonDirective } from '../../shared-ui/button/button';
import { DialogComponent } from '../../shared-ui/dialog/dialog';
import { RangeFieldComponent } from '../../shared-ui/range-field/range-field.component';
import { SettingsRowComponent } from '../../shared-ui/settings-row/settings-row.component';
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
@Component({
  selector: 'mn-vocabulary-filter-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    ButtonDirective,
    DialogComponent,
    RangeFieldComponent,
    SelectComponent,
    SettingsRowComponent,
  ],
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
        <mn-settings-row label="First studied" labelId="mn-filter-2-label">
          <mn-select
            labelledBy="mn-filter-2-label"
            label="First studied"
            [options]="firstStudiedOptions"
            [ngModel]="draft().firstStudied"
            (ngModelChange)="setFirstStudied($event)"
          />
        </mn-settings-row>
        <mn-range-field
          label="Difficulty"
          lowLabel="Minimum difficulty"
          highLabel="Maximum difficulty"
          [max]="100"
          [value]="draft().difficulty.min"
          [high]="draft().difficulty.max"
          [valueLabel]="difficultyLabel()"
          [valueText]="draft().difficulty.min + '%'"
          [highValueText]="draft().difficulty.max + '%'"
          (valueChange)="setMinimum($event)"
          (highChange)="setMaximum($event)"
        />
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
  protected readonly formatCountOf = formatCountOf;
  protected readonly matchCount = () =>
    applyBrowseQuery(this.data.entries, this.draft(), this.clock.now()).length;

  /** The band as one range, such as "20–80%". */
  protected difficultyLabel(): string {
    const { min, max } = this.draft().difficulty;
    return `${String(min)}–${String(max)}%`;
  }

  protected setSource(value: string): void {
    this.update({ sourceId: value === '' ? null : vocabularySourceId(value) });
  }

  protected setMinimum(value: number): void {
    this.update({ difficulty: { min: value, max: this.draft().difficulty.max } });
  }

  protected setMaximum(value: number): void {
    this.update({ difficulty: { min: this.draft().difficulty.min, max: value } });
  }

  protected setFirstStudied(value: string): void {
    this.update({ firstStudied: value as BrowseQuery['firstStudied'] });
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
