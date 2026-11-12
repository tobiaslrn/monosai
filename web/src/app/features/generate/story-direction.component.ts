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
import { ButtonDirective } from '../../shared-ui/button/button';
import { CardComponent } from '../../shared-ui/card/card.component';
import { ChipGroupComponent } from '../../shared-ui/chip-group/chip-group.component';
import { CountComponent } from '../../shared-ui/count/count.component';
import { DisclosureComponent } from '../../shared-ui/disclosure/disclosure.component';
import { DividerComponent } from '../../shared-ui/divider/divider.component';
import { FieldComponent } from '../../shared-ui/field/field.component';
import { ClusterComponent, StackComponent } from '../../shared-ui/layout/layout';

/**
 * The Direction step: six axes the learner may steer a story with.
 *
 * Each axis is a native disclosure whose closed summary states its value, and
 * the disclosures share a name so the browser keeps one open at a time. Chips
 * never move when one is picked: Any leads every row, Custom ends it, and a
 * custom option joins the row just before Custom and stays there.
 */
@Component({
  selector: 'mn-story-direction',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonDirective,
    CardComponent,
    ChipGroupComponent,
    ClusterComponent,
    CountComponent,
    DisclosureComponent,
    DividerComponent,
    FieldComponent,
    IconComponent,
    StackComponent,
  ],
  template: `
    <mn-card heading="Direction" [level]="2" [focusable]="true">
      <button
        mn-card-action
        mnButton="ghost"
        type="button"
        data-testid="surprise-direction"
        [disabled]="disabled()"
        (click)="surprise()"
      >
        <mn-icon name="random" [size]="18" />
        <span>Surprise me</span>
      </button>

      <mn-stack [gap]="0">
        @for (axis of axes; track axis) {
          <mn-divider />
          <mn-disclosure
            class="axis"
            [flush]="true"
            name="mn-story-axis"
            valueTestId="axis-value"
            [attr.data-axis]="axis"
            [heading]="labels[axis]"
            [value]="summary(axis)"
            [open]="openAxis() === axis"
            (openChange)="onToggle(axis, $event)"
          >
            <mn-chip-group [label]="labels[axis]">
              <button
                mnButton
                type="button"
                [attr.aria-pressed]="!isSet(axis)"
                [disabled]="disabled()"
                (click)="draft.clearAxis(axis)"
              >
                Any
              </button>
              @for (option of options(axis); track option) {
                <button
                  mnButton
                  type="button"
                  [attr.aria-pressed]="isChosen(axis, option)"
                  [disabled]="disabled()"
                  (click)="draft.toggleOption(axis, option)"
                >
                  {{ option }}
                </button>
              }
              <button
                mnButton
                type="button"
                data-custom-toggle
                [attr.aria-expanded]="customAxis() === axis"
                [attr.aria-controls]="'mn-custom-' + axis"
                [disabled]="disabled()"
                (click)="toggleCustom(axis)"
              >
                <mn-icon name="add" [size]="16" />
                <span>Custom</span>
              </button>
            </mn-chip-group>
            @if (customAxis() === axis) {
              <form [id]="'mn-custom-' + axis" (submit)="addCustom(axis, $event)">
                <mn-cluster fill="first">
                  <input
                    class="mn-control"
                    type="text"
                    autocomplete="off"
                    data-testid="custom-option"
                    [attr.maxlength]="customLimit"
                    [attr.aria-label]="'Custom ' + labels[axis].toLowerCase()"
                    (keydown.escape)="closeCustom(axis, $event)"
                  />
                  <button mnButton type="submit">Add</button>
                </mn-cluster>
              </form>
            }
          </mn-disclosure>
        }
        <mn-divider />
      </mn-stack>

      <mn-stack [gap]="2">
        <mn-field
          label="Instructions (optional)"
          errorId="mn-instructions-limit"
          [error]="instructionsTooLong() ? instructionsLimitMessage() : null"
        >
          <textarea
            id="mn-instructions"
            rows="2"
            data-testid="special-instructions"
            placeholder="Tone, viewpoint, dialogue"
            [value]="draft.specialInstructions()"
            [attr.aria-describedby]="instructionsDescriptionIds()"
            [attr.aria-invalid]="instructionsTooLong()"
            [disabled]="disabled()"
            (input)="onInstructions($event)"
          ></textarea>
        </mn-field>
        @if (instructionsCounterVisible()) {
          <mn-count id="mn-instructions-count" [over]="instructionsTooLong()">
            {{ formatCount(draft.instructionsLength()) }} of
            {{ formatCount(draft.instructionsLimit) }} characters
          </mn-count>
        }
      </mn-stack>
    </mn-card>
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

  /** Every row starts closed, so Surprise me shows each value in its summary. */
  protected readonly openAxis = signal<StoryAxis | null>(null);
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
  protected onToggle(axis: StoryAxis, open: boolean): void {
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
