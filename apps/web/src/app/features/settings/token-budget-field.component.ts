import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import {
  MAX_STORY_TOKEN_BUDGET,
  MIN_STORY_TOKEN_BUDGET,
  isValidStoryTokenBudget,
} from '../../domain/settings/settings';

let nextId = 0;

/**
 * One model's completion budget.
 *
 * The field keeps whatever is being typed so a half-written number is never
 * snapped back mid-edit, and commits only a value inside the allowed range;
 * anything outside it stays on screen as an error rather than being stored.
 */
@Component({
  selector: 'mn-token-budget-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <input
      class="mn-control"
      type="number"
      inputmode="numeric"
      [id]="id"
      [min]="min"
      [max]="maxValue()"
      step="1"
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
      <p [id]="errorId" class="mn-field-error" role="alert">
        Use a whole number between {{ min }} and {{ maxValue() }}.
      </p>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--space-1);
      min-width: 0;
    }
  `,
})
export class TokenBudgetFieldComponent {
  readonly value = input.required<number>();
  /** Model-reported maximum, or the manual safety ceiling when unknown. */
  readonly maxValue = input(MAX_STORY_TOKEN_BUDGET);
  readonly disabled = input(false);
  /** Id of the visible label this field sits beside. */
  readonly labelledBy = input.required<string>();
  readonly testId = input<string | null>(null);
  readonly committed = output<number>();

  protected readonly min = MIN_STORY_TOKEN_BUDGET;
  protected readonly id = `mn-token-budget-${String(nextId++)}`;
  protected readonly errorId = `${this.id}-error`;

  protected readonly draft = linkedSignal(() => String(this.value()));
  protected readonly invalid = computed(
    () => !isValidStoryTokenBudget(Number(this.draft()), this.maxValue()),
  );

  protected onInput(event: Event): void {
    this.draft.set((event.target as HTMLInputElement).value);
  }

  protected commit(): void {
    const parsed = Number(this.draft());
    if (isValidStoryTokenBudget(parsed, this.maxValue()) && parsed !== this.value()) {
      this.committed.emit(parsed);
    }
  }
}
