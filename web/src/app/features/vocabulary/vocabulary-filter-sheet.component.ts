import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { hasModifierKey } from '@angular/cdk/keycodes';
import { FormsModule } from '@angular/forms';
import { CLOCK } from '../../application/shared/repository-tokens';
import { ViewportService } from '../../core/platform/viewport.service';
import { ButtonDirective } from '../../shared-ui/button/button';
import { SheetPanelComponent } from '../../shared-ui/sheet/sheet-panel.component';
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

/** Longer than the departure, so a missed `transitionend` still closes the dialog. */
const DEPARTURE_FALLBACK_MS = 400;

/** CDK dialog content used as a bottom sheet below the desktop breakpoint. */
@Component({
  selector: 'mn-vocabulary-filter-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ButtonDirective, SheetPanelComponent],
  template: `
    <mn-sheet-panel
      heading="Filters"
      headingId="vocabulary-filter-heading"
      handleLabel="Close filters"
      [leaving]="leaving()"
      (dismissed)="depart(undefined)"
      (departed)="onDeparted()"
    >
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

      <button mn-sheet-action mnButton="primary" type="button" (click)="depart(draft())">
        Show {{ formatCountOf(matchCount(), 'word') }}
      </button>
      <button mn-sheet-action mnButton="ghost" type="button" (click)="reset()">Reset</button>
    </mn-sheet-panel>
  `,
})
export class VocabularyFilterSheetComponent {
  constructor() {
    // The dialog would remove the sheet the moment it closed. Taking over
    // backdrop and Escape dismissal lets the surface depart before it does.
    this.dialogRef.disableClose = true;
    this.dialogRef.backdropClick.subscribe(() => {
      this.depart(undefined);
    });
    this.dialogRef.keydownEvents.subscribe((event) => {
      if (event.key === 'Escape' && !hasModifierKey(event)) {
        event.preventDefault();
        this.depart(undefined);
      }
    });
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.fallback);
    });
  }

  protected readonly data = inject<VocabularyFilterSheetData>(DIALOG_DATA);
  private readonly dialogRef = inject<DialogRef<BrowseQuery | undefined>>(DialogRef);
  private readonly clock = inject(CLOCK);
  private readonly viewport = inject(ViewportService);
  private fallback: ReturnType<typeof setTimeout> | undefined;
  private result: BrowseQuery | undefined;
  protected readonly draft = signal<BrowseQuery>(this.data.query);

  /** Set once a dismissal has begun, so a second one during the slide is ignored. */
  protected readonly leaving = signal(false);

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
   * Sends the sheet away, then asks the dialog to close with `result`.
   *
   * The dialog removes its element the moment it closes, so the surface slides
   * out first. Dragging the handle or dismissing from outside discards the
   * draft (`undefined`); only Show commits it. A second dismissal while the
   * sheet is already leaving is ignored.
   */
  protected depart(result: BrowseQuery | undefined): void {
    if (this.leaving()) {
      return;
    }
    this.result = result;
    if (!this.viewport.isMobile() || this.viewport.prefersReducedMotion()) {
      this.finish();
      return;
    }
    this.leaving.set(true);
    this.dialogRef.overlayRef.backdropElement?.classList.add('is-leaving');
    // A transition that never runs (a hidden tab) must not strand the dialog.
    this.fallback = setTimeout(() => {
      this.finish();
    }, DEPARTURE_FALLBACK_MS);
  }

  /** The handle springing back also ends a slide; only the slide away closes. */
  protected onDeparted(): void {
    if (this.leaving()) {
      this.finish();
    }
  }

  private finish(): void {
    clearTimeout(this.fallback);
    this.dialogRef.close(this.result);
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
