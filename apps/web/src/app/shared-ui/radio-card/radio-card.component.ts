import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RADIO_CARD_GROUP } from './radio-card-group.component';

/**
 * One option card: a native radio, a body, and room for what belongs to the
 * option without being part of choosing it.
 *
 * The card's look — the selection tint, the keyboard ring, the guarded hover —
 * is `_option-card.scss`, read off the radio with `:has(input:checked)`, so no
 * class mirrors the selection. Content is projected:
 *
 *  - default: the body beside the radio;
 *  - `[mn-radio-card-end]`: a trailing indicator inside the choosing label;
 *  - `[mn-radio-card-extra]`: controls that live in the card but outside the
 *    label, such as an editor or an Edit action.
 *
 * `inset` is the card sunken inside a card that offers it, which is how drafted
 * options sit; without it the card is its own raised surface.
 */
@Component({
  selector: 'mn-radio-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'mn-option-card', '[class.mn-option-card--inset]': 'inset()' },
  template: `
    <label class="mn-option-card__choice">
      <input
        type="radio"
        [name]="group.name()"
        [value]="value()"
        [checked]="group.value() === value()"
        [disabled]="group.disabled()"
        (change)="group.select(value())"
      />
      <span class="mn-option-card__body"><ng-content /></span>
      <ng-content select="[mn-radio-card-end]" />
    </label>
    <ng-content select="[mn-radio-card-extra]" />
  `,
})
export class RadioCardComponent {
  protected readonly group = inject(RADIO_CARD_GROUP);
  readonly value = input.required<string>();
  readonly inset = input(false);
}
