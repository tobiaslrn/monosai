import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

/** One choice in a segmented control. */
export interface SegmentedOption<T extends string> {
  readonly value: T;
  readonly label: string;
}

let nextSegmentedId = 0;

/**
 * One choice out of a few, as native radios in the shared segmented look.
 *
 * The inputs are real radios sharing one `name`, so the browser owns arrow-key
 * movement, the roving tab stop, and the checked state. The host is the
 * `mn-segmented` group, which keeps the style rule in
 * `styles/components/_segmented.scss` as its only source.
 *
 * `value` is a model: bind it two ways, or read it with `[value]` and
 * `(valueChange)` where the choice has to be stored before it is shown.
 */
@Component({
  selector: 'mn-segmented-control',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'mn-segmented',
    role: 'radiogroup',
    '[class.mn-segmented--joined]': 'joined()',
    '[attr.aria-label]': 'label()',
  },
  template: `
    @for (option of options(); track option.value) {
      <label>
        <input
          type="radio"
          [name]="name()"
          [value]="option.value"
          [checked]="option.value === value()"
          [disabled]="disabled()"
          (change)="value.set(option.value)"
        />
        <span>{{ option.label }}</span>
      </label>
    }
  `,
})
export class SegmentedControlComponent<T extends string> {
  /** The accessible name of the group; the visible question is the caller's. */
  readonly label = input.required<string>();
  readonly options = input.required<readonly SegmentedOption<T>[]>();
  readonly value = model<T | undefined>(undefined);
  readonly name = input(`mn-segmented-${String(nextSegmentedId++)}`);
  /** The compact variant for one short, stable choice set beside a label. */
  readonly joined = input(false);
  readonly disabled = input(false);
}
