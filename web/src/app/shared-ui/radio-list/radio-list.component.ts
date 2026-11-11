import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** One option of a radio list: its value, its name, and the line that says what it does. */
export interface RadioListOption<T extends string = string> {
  readonly value: T;
  readonly label: string;
  readonly description?: string;
}

let nextRadioListId = 0;

/**
 * Two to five options that each need a line, in place on a page: every option a
 * row with a leading radio, its name, and its muted description. All the
 * explanations stay visible, and the whole row is the target.
 *
 *   <mn-section heading="Pace" [rows]="true">
 *     <mn-radio-list label="Pace" [options]="paces" [value]="pace" (valueChange)="set($event)" />
 *   </mn-section>
 *
 * The rows are the settings row (`mn-settings-row`) with a lead, and the inputs
 * are native radios under one name, so the browser owns arrow-key movement and
 * the roving tab stop. A choice applies at once, as a switch does.
 */
@Component({
  selector: 'mn-radio-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'mn-radio-list',
    role: 'radiogroup',
    '[attr.aria-label]': 'label()',
    '[attr.data-testid]': 'testId()',
  },
  template: `
    @for (option of options(); track option.value; let index = $index) {
      <label class="mn-settings-row mn-settings-row--radio">
        <input
          type="radio"
          class="mn-settings-row__lead"
          [name]="name"
          [value]="option.value"
          [checked]="option.value === value()"
          [disabled]="disabled()"
          [attr.data-value]="option.value"
          [attr.aria-labelledby]="idOf(index, 'title')"
          [attr.aria-describedby]="option.description ? idOf(index, 'details') : null"
          (change)="valueChange.emit(option.value)"
        />
        <span class="mn-settings-row__title" [id]="idOf(index, 'title')">{{ option.label }}</span>
        @if (option.description) {
          <span class="mn-settings-row__details" [id]="idOf(index, 'details')">{{
            option.description
          }}</span>
        }
      </label>
    }
  `,
})
export class RadioListComponent<T extends string = string> {
  private readonly instance = nextRadioListId++;
  protected readonly name = `mn-radio-list-${String(this.instance)}`;

  /** The accessible name of the group; the visible one is the section's heading. */
  readonly label = input.required<string>();
  readonly options = input.required<readonly RadioListOption<T>[]>();
  readonly value = input<T | null>(null);
  readonly disabled = input(false);
  /** For durable tests: on the group. */
  readonly testId = input<string | null>(null);
  readonly valueChange = output<T>();

  protected idOf(index: number, part: 'title' | 'details'): string {
    return `${this.name}-${String(index)}-${part}`;
  }
}
