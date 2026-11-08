import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

let nextRangeId = 0;

/**
 * A slider over a few fixed steps, with its label and the value it stands at
 * on the line above it.
 *
 *   <mn-range-field label="Length" [valueLabel]="'Short · about 8 sentences'"
 *                   [max]="4" [value]="index" (valueChange)="setIndex($event)">
 *     <mn-notice id="length-warning" tone="warning">…</mn-notice>
 *   </mn-range-field>
 *
 * The track is ticked at every step and filled up to the thumb. The value
 * line is announced as it changes; `valueText` is what the slider itself
 * says. Projected content follows the slider, such as a warning about the
 * value, which `describedBy` can name.
 */
@Component({
  selector: 'mn-range-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="heading">
      <label [for]="inputId">{{ label() }}</label>
      <output [for]="inputId" aria-live="polite">{{ valueLabel() }}</output>
    </div>
    <input
      type="range"
      [id]="inputId"
      [min]="min()"
      [max]="max()"
      [step]="step()"
      [value]="value()"
      [disabled]="disabled()"
      [attr.data-testid]="testId()"
      [attr.aria-valuetext]="valueText()"
      [attr.aria-describedby]="describedBy()"
      [style.--slider-progress.%]="progress()"
      [style.--slider-step.%]="stepWidth()"
      (input)="onInput($event)"
    />
    <ng-content />
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      min-width: 0;
    }

    .heading {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-3);
      align-items: baseline;
      justify-content: space-between;
    }

    label {
      font-weight: var(--weight-semibold);
    }

    output {
      color: var(--text-secondary);
      font-size: var(--text-sm);
      text-align: end;
    }

    /*
     * The native thumb is centred on the track by a negative margin, so both
     * sizes are properties and the margin is computed from them. The thumb's
     * overhang at each end is the margin that keeps it inside the field.
     */
    input {
      --slider-track-size: 10px;
      --slider-thumb-size: 22px;

      width: calc(100% - var(--slider-thumb-size));
      height: var(--touch-target);
      margin: 0 calc(var(--slider-thumb-size) / 2);
      padding: 0;
      appearance: none;
      background: transparent;
      cursor: pointer;
    }

    input::-webkit-slider-runnable-track {
      height: var(--slider-track-size);
      border-radius: var(--radius-pill);
      background-color: var(--surface-sunken);
      background-image:
        repeating-linear-gradient(
          to right,
          transparent 0 calc(var(--slider-step) - 1px),
          color-mix(in srgb, var(--border-strong) 20%, transparent) calc(var(--slider-step) - 1px)
            var(--slider-step)
        ),
        linear-gradient(
          to right,
          var(--action-primary) 0 var(--slider-progress),
          transparent var(--slider-progress) 100%
        );
    }

    input::-webkit-slider-thumb {
      width: var(--slider-thumb-size);
      height: var(--slider-thumb-size);
      margin-top: calc((var(--slider-track-size) - var(--slider-thumb-size)) / 2);
      border: 4px solid var(--surface-raised);
      border-radius: var(--radius-pill);
      appearance: none;
      background: var(--action-primary);
      box-shadow: var(--shadow-focus);
    }

    input::-moz-range-track {
      height: var(--slider-track-size);
      border-radius: var(--radius-pill);
      background-color: var(--surface-sunken);
      background-image: repeating-linear-gradient(
        to right,
        transparent 0 calc(var(--slider-step) - 1px),
        color-mix(in srgb, var(--border-strong) 20%, transparent) calc(var(--slider-step) - 1px)
          var(--slider-step)
      );
    }

    input::-moz-range-progress {
      height: var(--slider-track-size);
      border-radius: var(--radius-pill);
      background: var(--action-primary);
    }

    input::-moz-range-thumb {
      width: var(--slider-thumb-size);
      height: var(--slider-thumb-size);
      border: 4px solid var(--surface-raised);
      border-radius: var(--radius-pill);
      background: var(--action-primary);
      box-shadow: var(--shadow-focus);
    }

    input:focus-visible {
      outline: 3px solid var(--focus-ring);
      outline-offset: 2px;
      border-radius: var(--radius-pill);
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
  readonly value = input.required<number>();
  readonly disabled = input(false);
  /** What the slider says its value is, when the number alone means nothing. */
  readonly valueText = input<string | null>(null);
  readonly describedBy = input<string | null>(null);
  /** For durable tests: on the slider. */
  readonly testId = input<string | null>(null);
  readonly valueChange = output<number>();

  protected readonly inputId = `mn-range-${String(nextRangeId++)}`;
  protected readonly progress = computed(
    () => ((this.value() - this.min()) / (this.max() - this.min())) * 100,
  );
  protected readonly stepWidth = computed(() => (this.step() / (this.max() - this.min())) * 100);

  protected onInput(event: Event): void {
    this.valueChange.emit((event.target as HTMLInputElement).valueAsNumber);
  }
}
