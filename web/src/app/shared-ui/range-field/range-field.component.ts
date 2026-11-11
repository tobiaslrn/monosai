import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

let nextRangeId = 0;

/**
 * The one slider, drawn as a row: its label and the value it stands at share
 * the first line, and the track is under them.
 *
 *   <mn-range-field label="Length" [valueLabel]="'Short · about 8 sentences'"
 *                   [max]="3" [value]="index" (valueChange)="setIndex($event)">
 *     <mn-notice id="length-warning" tone="warning">…</mn-notice>
 *   </mn-range-field>
 *
 * Giving it `high` makes it a range: one track with two thumbs, whose
 * `value` is the low end and `high` the high end. Each thumb is a native
 * slider with its own name, so the keyboard and assistive technology work
 * as they do on any slider, and the thumbs never cross.
 *
 * The track is filled between the start (or the low thumb) and the thumb. It
 * carries no ticks: a mark with no label is decoration, and the value line
 * already says where the thumb stands. The value line is announced as it
 * changes; `valueText` is what the slider itself says. Projected content
 * follows the slider, such as a warning about the value, which `describedBy`
 * can name.
 *
 * It spans a card of rows as a row does, so it brings the row's padding.
 */
@Component({
  selector: 'mn-range-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.role]': "isRange() ? 'group' : null",
    '[attr.aria-labelledby]': 'isRange() ? labelId : null',
  },
  template: `
    <div class="heading">
      <label [id]="labelId" [for]="inputId">{{ label() }}</label>
      <output [for]="isRange() ? inputId + ' ' + highId : inputId" aria-live="polite">{{
        valueLabel()
      }}</output>
    </div>
    <div class="slider" [style.--slider-from.%]="from()" [style.--slider-to.%]="to()">
      <span class="track" aria-hidden="true"><span class="fill"></span></span>
      <input
        type="range"
        [id]="inputId"
        [min]="min()"
        [max]="max()"
        [step]="step()"
        [value]="value()"
        [disabled]="disabled()"
        [attr.data-testid]="testId()"
        [attr.aria-label]="isRange() ? lowLabel() : null"
        [attr.aria-valuetext]="valueText()"
        [attr.aria-describedby]="describedBy()"
        (input)="onLow($event)"
      />
      @if (high() !== null) {
        <input
          type="range"
          [id]="highId"
          [min]="min()"
          [max]="max()"
          [step]="step()"
          [value]="high()"
          [disabled]="disabled()"
          [attr.data-testid]="highTestId()"
          [attr.aria-label]="highLabel()"
          [attr.aria-valuetext]="valueText()"
          [attr.aria-describedby]="describedBy()"
          (input)="onHigh($event)"
        />
      }
    </div>
    <ng-content />
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
      min-width: 0;
      padding: var(--row-pad-block) var(--surface-inset);
    }

    .heading {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-1) var(--space-3);
      align-items: baseline;
      justify-content: space-between;
    }

    label {
      font-size: var(--text-md);
      font-weight: var(--weight-medium);
      line-height: var(--leading-snug);
    }

    output {
      color: var(--text-secondary);
      font-size: var(--text-md);
      line-height: var(--leading-snug);
      text-align: end;
    }

    /*
     * The thumb is centred on the track, so the track is inset by half of it at
     * each end and the thumb's overhang stays inside the row. The native tracks
     * are drawn here instead, so one fill can run between two thumbs.
     */
    .slider {
      --slider-track-size: 10px;
      --slider-thumb-size: 22px;

      position: relative;
      height: var(--touch-target);
    }

    .track {
      position: absolute;
      inset-block: calc(50% - var(--slider-track-size) / 2);
      inset-inline: calc(var(--slider-thumb-size) / 2);
      border-radius: var(--radius-pill);
      background: var(--surface-sunken);
    }

    .fill {
      position: absolute;
      inset-block: 0;
      inset-inline-start: var(--slider-from, 0%);
      inset-inline-end: calc(100% - var(--slider-to, 0%));
      border-radius: var(--radius-pill);
      background: var(--action-primary);
    }

    input {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      margin: 0;
      padding: 0;
      appearance: none;
      background: transparent;
      cursor: pointer;
    }

    /* Two sliders share one track: only the thumbs take a press. */
    input:not(:only-of-type) {
      pointer-events: none;
    }

    input::-webkit-slider-runnable-track {
      height: 100%;
      background: transparent;
    }

    input::-moz-range-track {
      height: 100%;
      background: transparent;
    }

    input::-webkit-slider-thumb {
      width: var(--slider-thumb-size);
      height: var(--slider-thumb-size);
      margin-top: calc((var(--touch-target) - var(--slider-thumb-size)) / 2);
      border: 4px solid var(--surface-raised);
      border-radius: var(--radius-pill);
      appearance: none;
      background: var(--action-primary);
      box-shadow: var(--shadow-thumb-ring);
      pointer-events: auto;
    }

    input::-moz-range-thumb {
      width: var(--slider-thumb-size);
      height: var(--slider-thumb-size);
      border: 4px solid var(--surface-raised);
      border-radius: var(--radius-pill);
      background: var(--action-primary);
      box-shadow: var(--shadow-thumb-ring);
      pointer-events: auto;
    }

    input:focus-visible {
      outline: none;
    }

    input:focus-visible::-webkit-slider-thumb {
      outline: 3px solid var(--focus-ring);
      outline-offset: 2px;
    }

    input:focus-visible::-moz-range-thumb {
      outline: 3px solid var(--focus-ring);
      outline-offset: 2px;
    }

    input:disabled {
      cursor: not-allowed;
    }
  `,
})
export class RangeFieldComponent {
  readonly label = input.required<string>();
  /** The value as words, on the label's line. */
  readonly valueLabel = input.required<string>();
  readonly min = input(0);
  readonly max = input.required<number>();
  readonly step = input(1);
  /** The value; for a range, its low end. */
  readonly value = input.required<number>();
  /** Makes the field a range: the high end, which never goes below `value`. */
  readonly high = input<number | null>(null);
  readonly disabled = input(false);
  /** What the slider says its value is, when the number alone means nothing. */
  readonly valueText = input<string | null>(null);
  readonly describedBy = input<string | null>(null);
  /** The names of a range's two thumbs. */
  readonly lowLabel = input('Minimum');
  readonly highLabel = input('Maximum');
  /** For durable tests: on the slider, or on the low thumb of a range. */
  readonly testId = input<string | null>(null);
  /** For durable tests: on a range's high thumb. */
  readonly highTestId = input<string | null>(null);
  readonly valueChange = output<number>();
  readonly highChange = output<number>();

  private readonly id = nextRangeId++;
  protected readonly inputId = `mn-range-${String(this.id)}`;
  protected readonly highId = `mn-range-${String(this.id)}-high`;
  protected readonly labelId = `mn-range-${String(this.id)}-label`;
  protected readonly isRange = computed(() => this.high() !== null);

  private readonly span = computed(() => this.max() - this.min());
  private percent(value: number): number {
    return this.span() === 0 ? 0 : ((value - this.min()) / this.span()) * 100;
  }
  protected readonly from = computed(() => (this.isRange() ? this.percent(this.value()) : 0));
  protected readonly to = computed(() =>
    this.percent(this.isRange() ? (this.high() ?? this.max()) : this.value()),
  );

  protected onLow(event: Event): void {
    const input = event.target as HTMLInputElement;
    const high = this.high();
    const next = high === null ? input.valueAsNumber : Math.min(input.valueAsNumber, high);
    input.value = String(next);
    this.valueChange.emit(next);
  }

  protected onHigh(event: Event): void {
    const input = event.target as HTMLInputElement;
    const next = Math.max(input.valueAsNumber, this.value());
    input.value = String(next);
    this.highChange.emit(next);
  }
}
