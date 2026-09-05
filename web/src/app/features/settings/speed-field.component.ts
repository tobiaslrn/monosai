import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import {
  MAX_TTS_SPEED,
  MIN_TTS_SPEED,
  isValidTtsSpeed,
} from '../../application/settings/tts.store';

let nextId = 0;

/**
 * How fast the voice reads, as a field that commits only a usable number.
 *
 * The same contract as the token budget field, and for the same reason: the
 * box keeps whatever is being typed, and an empty or out-of-range value stays
 * on screen as an error instead of being stored. Clearing the field used to
 * write the *minimum* — half speed — into settings, which is the one answer a
 * learner clearing a box to retype never meant, and which silently retired the
 * model test and hid every clip made at the previous speed.
 */
@Component({
  selector: 'mn-speed-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <input
      class="mn-control"
      type="number"
      inputmode="decimal"
      [id]="id"
      [min]="min"
      [max]="max"
      step="0.05"
      [disabled]="disabled()"
      [attr.data-testid]="testId()"
      [attr.aria-labelledby]="labelledBy()"
      [attr.aria-invalid]="invalid()"
      [attr.aria-describedby]="invalid() ? errorId : null"
      [value]="draft()"
      (input)="onInput($event)"
      (change)="commit()"
    />
    @if (invalid()) {
      <p [id]="errorId" class="error" role="alert">
        Use a number between {{ min }} and {{ max }}. Your saved speed is unchanged.
      </p>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--space-1);
      min-width: 0;
    }
    .error {
      margin: 0;
      color: var(--status-danger);
      font-size: var(--text-sm);
    }
  `,
})
export class SpeedFieldComponent {
  readonly value = input.required<number>();
  readonly disabled = input(false);
  /** Id of the visible label this field sits beside. */
  readonly labelledBy = input.required<string>();
  readonly testId = input<string | null>(null);
  readonly committed = output<number>();

  protected readonly min = MIN_TTS_SPEED;
  protected readonly max = MAX_TTS_SPEED;
  protected readonly id = `mn-speed-${String(nextId++)}`;
  protected readonly errorId = `${this.id}-error`;

  protected readonly draft = linkedSignal(() => String(this.value()));
  protected readonly invalid = computed(() => !isValidTtsSpeed(Number(this.draft())));

  protected onInput(event: Event): void {
    this.draft.set((event.target as HTMLInputElement).value);
  }

  protected commit(): void {
    const parsed = Number(this.draft());
    if (isValidTtsSpeed(parsed) && parsed !== this.value()) {
      this.committed.emit(parsed);
    }
  }
}
