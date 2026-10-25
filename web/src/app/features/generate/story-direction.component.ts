import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { GenerationDraftStore } from '../../application/generation/generation-draft.store';
import { axisOptions } from '../../domain/ai/story-direction';
import {
  MAX_CUSTOM_OPTION_LENGTH,
  STORY_AXES,
  STORY_AXIS_LABELS,
  type StoryAxis,
} from '../../domain/ai/story-direction-options';
import { formatCount, formatCountOf } from '../../domain/shared/locale';
import { IconComponent } from '../../shared-ui/icon/icon.component';

/**
 * The Direction step: seven axes the learner may steer a story with.
 *
 * Each axis is a native disclosure whose closed summary states its value, and
 * the disclosures share a name so the browser keeps one open at a time. Chips
 * never move when one is picked: Any leads every row, Custom ends it, and a
 * custom option joins the row just before Custom and stays there.
 */
@Component({
  selector: 'mn-story-direction',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <section class="mn-card mn-stack" aria-labelledby="mn-direction-title">
      <div class="card-head">
        <h2 id="mn-direction-title" class="mn-card-title" tabindex="-1" data-step-heading>
          Direction
        </h2>
        <button
          type="button"
          class="mn-button mn-button--ghost"
          data-testid="surprise-direction"
          [disabled]="disabled()"
          (click)="surprise()"
        >
          <mn-icon name="random" [size]="18" />
          <span>Surprise me</span>
        </button>
      </div>

      <div class="axes">
        @for (axis of axes; track axis) {
          <details
            class="mn-disclosure axis"
            name="mn-story-axis"
            [attr.data-axis]="axis"
            [open]="openAxis() === axis"
            (toggle)="onToggle(axis, $event)"
          >
            <summary>
              <span class="axis-label">{{ labels[axis] }}</span>
              <span class="axis-value" [class.is-set]="isSet(axis)" data-testid="axis-value">
                {{ summary(axis) }}
              </span>
            </summary>
            <div class="axis-body">
              <div class="chips" role="group" [attr.aria-label]="labels[axis]">
                <button
                  type="button"
                  class="mn-button"
                  [attr.aria-pressed]="!isSet(axis)"
                  [disabled]="disabled()"
                  (click)="draft.clearAxis(axis)"
                >
                  Any
                </button>
                @for (option of options(axis); track option) {
                  <button
                    type="button"
                    class="mn-button"
                    [attr.aria-pressed]="isChosen(axis, option)"
                    [disabled]="disabled()"
                    (click)="draft.toggleOption(axis, option)"
                  >
                    {{ option }}
                  </button>
                }
                <button
                  type="button"
                  class="mn-button"
                  data-custom-toggle
                  [attr.aria-expanded]="customAxis() === axis"
                  [attr.aria-controls]="'mn-custom-' + axis"
                  [disabled]="disabled()"
                  (click)="toggleCustom(axis)"
                >
                  <mn-icon name="add" [size]="16" />
                  <span>Custom</span>
                </button>
              </div>
              @if (customAxis() === axis) {
                <form
                  class="custom-row"
                  [id]="'mn-custom-' + axis"
                  (submit)="addCustom(axis, $event)"
                >
                  <input
                    class="mn-control"
                    type="text"
                    autocomplete="off"
                    data-testid="custom-option"
                    [attr.maxlength]="customLimit"
                    [attr.aria-label]="'Custom ' + labels[axis].toLowerCase()"
                    (keydown.escape)="closeCustom(axis, $event)"
                  />
                  <button type="submit" class="mn-button">Add</button>
                </form>
              }
            </div>
          </details>
        }
      </div>

      <div class="mn-field">
        <label for="mn-instructions">Special instructions (optional)</label>
        <textarea
          id="mn-instructions"
          rows="2"
          data-testid="special-instructions"
          placeholder="Tone, viewpoint, dialogue, or register"
          [value]="draft.specialInstructions()"
          [attr.aria-describedby]="instructionsDescriptionIds()"
          [attr.aria-invalid]="instructionsTooLong()"
          [disabled]="disabled()"
          (input)="onInstructions($event)"
        ></textarea>
        @if (instructionsCounterVisible()) {
          <p id="mn-instructions-count" class="counter" [class.is-over]="instructionsTooLong()">
            {{ formatCount(draft.instructionsLength()) }} of
            {{ formatCount(draft.instructionsLimit) }} characters
          </p>
        }
        @if (instructionsTooLong()) {
          <p id="mn-instructions-limit" class="mn-field-error" role="alert">
            {{ instructionsLimitMessage() }}
          </p>
        }
      </div>
    </section>
  `,
  styles: `
    .card-head {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2) var(--space-3);
      align-items: center;
      justify-content: space-between;
    }

    .card-head .mn-card-title:focus {
      outline: none;
    }

    .axes {
      display: flex;
      flex-direction: column;
    }

    .axis {
      border-top: 1px solid var(--border-subtle);
    }

    .axis:last-child {
      border-bottom: 1px solid var(--border-subtle);
    }

    .axis > summary {
      gap: var(--space-3);
    }

    .axis-label {
      flex: none;
    }

    .axis-value {
      min-width: 0;
      margin-inline-start: auto;
      overflow: hidden;
      color: var(--text-secondary);
      font-size: var(--text-sm);
      font-weight: var(--weight-medium);
      text-align: end;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .axis-value.is-set {
      color: var(--action-primary-text);
      font-weight: var(--weight-semibold);
    }

    .axis-body {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      padding-block: var(--space-1) var(--space-4);
    }

    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }

    .custom-row {
      display: flex;
      gap: var(--space-2);
    }

    .custom-row input {
      flex: 1;
      min-width: 0;
    }

    .counter {
      margin: 0;
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    .counter.is-over {
      color: var(--status-danger);
      font-weight: var(--weight-semibold);
    }
  `,
})
export class StoryDirectionComponent {
  protected readonly draft = inject(GenerationDraftStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  readonly disabled = input(false);

  protected readonly axes = STORY_AXES;
  protected readonly labels = STORY_AXIS_LABELS;
  protected readonly customLimit = MAX_CUSTOM_OPTION_LENGTH;
  protected readonly formatCount = formatCount;

  /** Genre is where a story starts, so it is the row that opens first. */
  protected readonly openAxis = signal<StoryAxis | null>('genre');
  protected readonly customAxis = signal<StoryAxis | null>(null);

  protected readonly instructionsTooLong = computed(
    () => this.draft.instructionsLength() > this.draft.instructionsLimit,
  );
  protected readonly instructionsCounterVisible = computed(() => {
    const length = this.draft.instructionsLength();
    const limit = this.draft.instructionsLimit;
    return length >= Math.ceil(limit * 0.8) || length > limit;
  });
  protected readonly instructionsDescriptionIds = computed(() => {
    const ids: string[] = [];
    if (this.instructionsCounterVisible()) ids.push('mn-instructions-count');
    if (this.instructionsTooLong()) ids.push('mn-instructions-limit');
    return ids.length > 0 ? ids.join(' ') : null;
  });
  protected readonly instructionsLimitMessage = computed(
    () =>
      `Remove ${formatCountOf(this.draft.instructionsLength() - this.draft.instructionsLimit, 'character')} to continue.`,
  );

  protected options(axis: StoryAxis): readonly string[] {
    return axisOptions(this.draft.direction(), axis);
  }

  protected isSet(axis: StoryAxis): boolean {
    return this.draft.direction().selected[axis].length > 0;
  }

  protected isChosen(axis: StoryAxis, option: string): boolean {
    return this.draft.direction().selected[axis].includes(option);
  }

  protected summary(axis: StoryAxis): string {
    const chosen = this.draft.direction().selected[axis];
    return chosen.length === 0 ? 'Any' : chosen.join(', ');
  }

  /**
   * Follows the browser's own toggling, including the row it closes when
   * another one opens, so the open row is never two places at once.
   */
  protected onToggle(axis: StoryAxis, event: Event): void {
    const open = (event.target as HTMLDetailsElement).open;
    if (open) {
      this.openAxis.set(axis);
    } else if (this.openAxis() === axis) {
      this.openAxis.set(null);
    }
    if (!open && this.customAxis() === axis) {
      this.customAxis.set(null);
    }
  }

  protected surprise(): void {
    this.customAxis.set(null);
    this.draft.surprise();
  }

  protected toggleCustom(axis: StoryAxis): void {
    if (this.customAxis() === axis) {
      this.customAxis.set(null);
      return;
    }
    this.customAxis.set(axis);
    afterNextRender(() => this.customInput(axis)?.focus(), { injector: this.injector });
  }

  protected addCustom(axis: StoryAxis, event: Event): void {
    event.preventDefault();
    const field = this.customInput(axis);
    if (field === null) {
      return;
    }
    const added = this.draft.addCustomOption(axis, field.value);
    if (!added.ok) {
      field.focus();
      return;
    }
    this.closeCustomRow(axis);
  }

  protected closeCustom(axis: StoryAxis, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.closeCustomRow(axis);
  }

  protected onInstructions(event: Event): void {
    this.draft.setSpecialInstructions((event.target as HTMLTextAreaElement).value);
  }

  /** Closes the field and hands focus back to the control that opened it. */
  private closeCustomRow(axis: StoryAxis): void {
    this.customAxis.set(null);
    afterNextRender(
      () =>
        this.host.nativeElement
          .querySelector<HTMLButtonElement>(`[data-axis="${axis}"] [data-custom-toggle]`)
          ?.focus(),
      { injector: this.injector },
    );
  }

  private customInput(axis: StoryAxis): HTMLInputElement | null {
    return this.host.nativeElement.querySelector<HTMLInputElement>(`#mn-custom-${axis} input`);
  }
}
