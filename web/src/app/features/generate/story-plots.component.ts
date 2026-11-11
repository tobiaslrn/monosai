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
import { StoryPlotStore } from '../../application/generation/story-plot.store';
import { PLOT_COUNT, type FrameValue } from '../../domain/ai/story-direction';
import { STORY_AXES } from '../../domain/ai/story-direction-options';
import { MAX_PLOT_LENGTH, isEditedPlot, type PlotCard } from '../../domain/ai/story-plot';
import { countCodePoints } from '../../domain/ai/story-request';
import { formatCount, formatCountOf } from '../../domain/shared/locale';
import { aiFailureMessage } from '../../shared-ui/ai-error/ai-error-copy';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import { RadioCardComponent } from '../../shared-ui/radio-card/radio-card.component';
import { RadioCardGroupComponent } from '../../shared-ui/radio-card/radio-card-group.component';
import { ButtonDirective } from '../../shared-ui/button/button';
import { CardComponent } from '../../shared-ui/card/card.component';
import { CountComponent } from '../../shared-ui/count/count.component';
import { FieldComponent } from '../../shared-ui/field/field.component';
import { ClusterComponent, StackComponent } from '../../shared-ui/layout/layout';
import { NoticeComponent } from '../../shared-ui/notice/notice.component';

const COUNT_WORDS = ['no plots', 'one plot', 'two plots', 'three plots'] as const;

/** One chip on a plot card: what it says and who chose it. */
interface PlotChip {
  readonly text: string;
  readonly kind: 'chosen' | 'rolled' | 'turn';
}

/**
 * The Plot step: three plots, one to pick, any of them editable.
 *
 * The plots are options inside one card rather than cards of their own, so the
 * page keeps two levels of grouping. Each chip says where its value came from
 * without colour alone: a rolled value is outlined with a dashed edge and named
 * as random to assistive technology, the turning point is named as one.
 */
@Component({
  selector: 'mn-story-plots',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonDirective,
    CardComponent,
    ClusterComponent,
    CountComponent,
    FieldComponent,
    IconComponent,
    NoticeComponent,
    RadioCardComponent,
    RadioCardGroupComponent,
    StackComponent,
  ],
  template: `
    <mn-card heading="Plot" [level]="2" [focusable]="true" [attr.aria-busy]="plots.isDrafting()">
      <button
        mn-card-action
        mnButton="ghost"
        type="button"
        data-testid="regenerate-plots"
        [disabled]="disabled() || !plots.canRegenerate()"
        (click)="regenerate()"
      >
        <mn-icon name="retry" />
        <span>Regenerate</span>
      </button>

      @if (failureMessage(); as message) {
        <mn-notice tone="warning" icon="warning" role="alert" data-testid="plot-failure">
          {{ message }}
        </mn-notice>
      }

      @if (plots.cards().length > 0) {
        @let locked = disabled() || plots.isDrafting();
        <mn-radio-card-group
          label="Choose a plot"
          name="mn-plot"
          [value]="selectedId()"
          [disabled]="locked"
          (valueChange)="choose($event)"
        >
          @for (card of plots.cards(); track card.id; let index = $index) {
            <mn-radio-card [value]="card.id" [inset]="true" data-testid="plot-option">
              <mn-cluster [gap]="1">
                @for (chip of chips(card); track $index) {
                  <span
                    class="mn-status-pill"
                    [class.mn-status-pill--dashed]="chip.kind === 'rolled'"
                  >
                    @if (chip.kind === 'turn') {
                      <mn-icon name="turning-point" [size]="16" />
                      <span class="mn-visually-hidden">Turning point: </span>
                    }
                    {{ chip.text }}
                    @if (chip.kind === 'rolled') {
                      <span class="mn-visually-hidden"> (random)</span>
                    }
                  </span>
                }
                @if (edited(card)) {
                  <span class="mn-status-pill">Edited</span>
                }
              </mn-cluster>
              @if (editing() !== card.id) {
                <span data-testid="plot-text">{{ card.text }}</span>
              }
              @if (editing() === card.id) {
                <mn-stack mn-radio-card-extra [gap]="2">
                  <mn-field
                    errorId="mn-plot-limit"
                    [error]="
                      tooLong(card)
                        ? 'Remove ' + overBy(card) + ' to continue.'
                        : card.text.trim() === ''
                          ? 'Write a plot to continue.'
                          : null
                    "
                  >
                    <textarea
                      rows="5"
                      data-testid="plot-editor"
                      [attr.aria-label]="'Plot ' + (index + 1)"
                      [attr.aria-describedby]="editDescriptionIds()"
                      [attr.aria-invalid]="tooLong(card)"
                      [disabled]="locked"
                      [value]="card.text"
                      (input)="onEdit(index, $event)"
                    ></textarea>
                  </mn-field>
                  @if (counterVisible(card)) {
                    <mn-count id="mn-plot-count" [over]="tooLong(card)">
                      {{ formatCount(length(card)) }} of {{ formatCount(limit) }} characters
                    </mn-count>
                  }
                </mn-stack>
              }
              @if (plots.selectedIndex() === index) {
                <mn-cluster mn-radio-card-extra justify="end">
                  <button
                    mnButton="ghost"
                    type="button"
                    data-testid="edit-plot"
                    data-edit-toggle
                    [disabled]="locked"
                    (click)="toggleEdit(index, card.id)"
                  >
                    @if (editing() === card.id) {
                      <mn-icon name="check" />
                      <span>Done</span>
                    } @else {
                      <mn-icon name="rename" />
                      <span>Edit</span>
                    }
                  </button>
                </mn-cluster>
              }
            </mn-radio-card>
          }
        </mn-radio-card-group>
      }

      @if (plots.isDrafting() && waitingLine(); as line) {
        <p class="mn-hint" role="status" data-testid="plot-waiting">{{ line }}</p>
      } @else if (plots.isDrafting()) {
        <p class="mn-visually-hidden" role="status">Writing new plots…</p>
      }
    </mn-card>
  `,
})
export class StoryPlotsComponent {
  protected readonly plots = inject(StoryPlotStore);
  private readonly draft = inject(GenerationDraftStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  readonly disabled = input(false);

  /** The card being edited, by its id, so the editor follows the card and not a slot. */
  protected readonly editing = signal<string | null>(null);
  protected readonly limit = MAX_PLOT_LENGTH;
  protected readonly formatCount = formatCount;

  protected readonly failureMessage = computed(() => {
    const failure = this.plots.failure();
    if (failure === null) {
      return null;
    }
    const what =
      failure.domain === 'ai'
        ? aiFailureMessage(failure, 'reader')
        : 'Monosai could not read your vocabulary or your library. Try again.';
    return `${what} Your choices are kept.`;
  });

  /** Said in place of the cards still to come, never over cards on screen. */
  protected readonly waitingLine = computed(() => {
    const missing = PLOT_COUNT - this.plots.cards().length;
    return missing > 0 ? `Writing ${COUNT_WORDS[this.plots.draftingCount()] ?? 'plots'}…` : null;
  });

  protected readonly selectedId = computed(
    () => this.plots.cards().at(this.plots.selectedIndex())?.id,
  );

  protected readonly editDescriptionIds = computed(() => {
    const id = this.editing();
    const card =
      id === null ? undefined : this.plots.cards().find((candidate) => candidate.id === id);
    if (card === undefined) {
      return null;
    }
    const ids: string[] = [];
    if (this.counterVisible(card)) ids.push('mn-plot-count');
    if (this.tooLong(card) || card.text.trim() === '') ids.push('mn-plot-limit');
    return ids.length > 0 ? ids.join(' ') : null;
  });

  protected chips(card: PlotCard): readonly PlotChip[] {
    const values: FrameValue[] = STORY_AXES.flatMap((axis) => [...card.frame.values[axis]]);
    return [
      ...values.map((value) => ({
        text: value.value,
        kind: value.rolled ? ('rolled' as const) : ('chosen' as const),
      })),
      { text: card.frame.turningPoint.label, kind: 'turn' as const },
    ];
  }

  protected edited(card: PlotCard): boolean {
    return isEditedPlot(card);
  }

  protected length(card: PlotCard): number {
    return countCodePoints(card.text.trim());
  }

  protected tooLong(card: PlotCard): boolean {
    return this.length(card) > MAX_PLOT_LENGTH;
  }

  protected overBy(card: PlotCard): string {
    return formatCountOf(this.length(card) - MAX_PLOT_LENGTH, 'character');
  }

  protected counterVisible(card: PlotCard): boolean {
    return this.length(card) >= Math.ceil(MAX_PLOT_LENGTH * 0.8);
  }

  protected choose(id: string | undefined): void {
    if (this.editing() !== id) {
      this.editing.set(null);
    }
    const index = this.plots.cards().findIndex((card) => card.id === id);
    if (index >= 0) {
      this.plots.select(index);
    }
  }

  protected toggleEdit(index: number, id: string): void {
    if (this.editing() === id) {
      this.editing.set(null);
      this.focusAfterRender('[data-edit-toggle]');
      return;
    }
    this.editing.set(id);
    this.focusAfterRender('[data-testid="plot-editor"]');
  }

  protected onEdit(index: number, event: Event): void {
    this.plots.edit(index, (event.target as HTMLTextAreaElement).value);
  }

  protected regenerate(): void {
    this.editing.set(null);
    void this.plots.regenerate(this.draft.direction(), this.draft.specialInstructions());
  }

  private focusAfterRender(selector: string): void {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus(), {
      injector: this.injector,
    });
  }
}
