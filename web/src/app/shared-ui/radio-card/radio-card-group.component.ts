import { ChangeDetectionStrategy, Component, InjectionToken, input, model } from '@angular/core';
import type { Signal } from '@angular/core';

let nextRadioCardGroupId = 0;

/** What a card needs from the group it sits in. */
export interface RadioCardGroup {
  readonly name: Signal<string>;
  readonly disabled: Signal<boolean>;
  readonly value: Signal<string | undefined>;
  select(value: string): void;
}

export const RADIO_CARD_GROUP = new InjectionToken<RadioCardGroup>('RADIO_CARD_GROUP');

/**
 * The group of option cards one of which is picked.
 *
 * The group owns the picked value once; every card derives whether it is
 * checked from it, so no caller computes selection per card. The cards inside
 * are native radios under one `name`, which is what gives arrow-key movement.
 */
@Component({
  selector: 'mn-radio-card-group',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: RADIO_CARD_GROUP, useExisting: RadioCardGroupComponent }],
  host: { role: 'radiogroup', class: 'mn-option-group', '[attr.aria-label]': 'label()' },
  template: `<ng-content />`,
})
export class RadioCardGroupComponent<T extends string> implements RadioCardGroup {
  readonly label = input.required<string>();
  readonly value = model<T | undefined>(undefined);
  readonly name = input(`mn-radio-card-group-${String(nextRadioCardGroupId++)}`);
  readonly disabled = input(false);

  select(value: string): void {
    this.value.set(value as T);
  }
}
