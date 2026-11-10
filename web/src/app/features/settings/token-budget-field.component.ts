import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import {
  MAX_STORY_TOKEN_BUDGET,
  MIN_STORY_TOKEN_BUDGET,
  isValidStoryTokenBudget,
} from '../../domain/settings/settings';
import { formatCount } from '../../domain/shared/locale';
import { FieldComponent } from '../../shared-ui/field/field.component';

let nextId = 0;

/** A whole number written plainly or grouped (`16,384`); NaN for anything else. */
function parseBudget(text: string): number {
  const digits = text.replace(/[,\s]/g, '');
  return /^\d+$/.test(digits) ? Number(digits) : Number.NaN;
}

/**
 * One model's completion budget.
 *
 * The field keeps whatever is being typed so a half-written number is never
 * snapped back mid-edit, and shows the number grouped (`16,384`) whenever it is
 * not being edited. Grouped input is accepted. It commits only a value inside the allowed range;
 * anything outside it stays on screen as an error rather than being stored.
 */
@Component({
  selector: 'mn-token-budget-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FieldComponent],
  template: `
    <mn-field [error]="invalid() ? errorMessage() : null" [errorId]="errorId">
      <input
        class="mn-control"
        type="text"
        inputmode="numeric"
        autocomplete="off"
        [id]="id"
        [disabled]="disabled()"
        [attr.data-testid]="testId()"
        [attr.aria-labelledby]="labelledBy()"
        [attr.aria-invalid]="invalid()"
        [attr.aria-describedby]="invalid() ? errorId : null"
        [value]="shown()"
        (focus)="onFocus($event)"
        (blur)="editing.set(false)"
        (input)="onInput($event)"
        (change)="commit()"
      />
    </mn-field>
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
  protected readonly editing = signal(false);
  /** Grouped at rest, as typed while editing. */
  protected readonly shown = computed(() => {
    const draft = this.draft();
    const digits = parseBudget(draft);
    return this.editing() || Number.isNaN(digits) ? draft : formatCount(digits);
  });
  protected readonly errorMessage = computed(
    () => `Use a whole number between ${String(this.min)} and ${String(this.maxValue())}.`,
  );
  protected readonly invalid = computed(
    () => !isValidStoryTokenBudget(parseBudget(this.draft()), this.maxValue()),
  );

  /**
   * Editing starts from the plain number, selected. The box is changed here, at
   * once, not left to the next render, which would replace what is typed.
   */
  protected onFocus(event: Event): void {
    const input = event.target as HTMLInputElement;
    input.value = this.draft();
    input.select();
    this.editing.set(true);
  }

  protected onInput(event: Event): void {
    this.draft.set((event.target as HTMLInputElement).value);
  }

  protected commit(): void {
    const parsed = parseBudget(this.draft());
    if (isValidStoryTokenBudget(parsed, this.maxValue()) && parsed !== this.value()) {
      this.committed.emit(parsed);
    }
  }
}
