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
  imports: [IconComponent],
  template: `
    <section
      class="mn-card mn-stack"
      aria-labelledby="mn-plot-title"
      [attr.aria-busy]="plots.isDrafting()"
    >
      <div class="card-head">
        <h2 id="mn-plot-title" class="mn-card-title" tabindex="-1" data-step-heading>Plot</h2>
        <button
          type="button"
          class="mn-button mn-button--ghost"
          data-testid="regenerate-plots"
          [disabled]="disabled() || !plots.canRegenerate()"
          (click)="regenerate()"
        >
          <mn-icon name="retry" [size]="18" />
          <span>Regenerate</span>
        </button>
      </div>

      @if (failureMessage(); as message) {
        <p class="mn-notice mn-notice--warning" role="alert" data-testid="plot-failure">
          <mn-icon name="warning" [size]="17" />
          <span>{{ message }}</span>
        </p>
      }

      @if (plots.cards().length > 0) {
        <fieldset class="plots" [disabled]="disabled() || plots.isDrafting()">
          <legend class="mn-visually-hidden">Choose a plot</legend>
          @for (card of plots.cards(); track $index; let index = $index) {
            <div
              class="plot mn-inset"
              data-testid="plot-option"
              [class.is-selected]="plots.selectedIndex() === index"
            >
              <label class="plot-choice">
                <input
                  type="radio"
                  name="mn-plot"
                  [value]="index"
                  [checked]="plots.selectedIndex() === index"
                  (change)="choose(index)"
                />
                <span class="plot-body">
                  <span class="pills">
                    @for (chip of chips(card); track $index) {
                      <span
                        class="mn-status-pill"
                        [class.mn-status-pill--dashed]="chip.kind === 'rolled'"
                        [class.mn-status-pill--accent]="chip.kind === 'turn'"
                      >
                        @if (chip.kind === 'turn') {
                          <span class="mn-visually-hidden">Turning point: </span>
                        }
                        {{ chip.text }}
                        @if (chip.kind === 'rolled') {
                          <span class="mn-visually-hidden"> (random)</span>
                        }
                      </span>
                    }
                    @if (edited(card)) {
                      <span class="mn-status-pill mn-status-pill--accent">Edited</span>
                    }
                  </span>
                  @if (editing() !== index) {
                    <span class="plot-text" data-testid="plot-text">{{ card.text }}</span>
                  }
                </span>
              </label>
              @if (editing() === index) {
                <div class="mn-field plot-edit">
                  <textarea
                    rows="5"
                    data-testid="plot-editor"
                    [attr.aria-label]="'Plot ' + (index + 1)"
                    [attr.aria-describedby]="editDescriptionIds()"
                    [attr.aria-invalid]="tooLong(card)"
                    [value]="card.text"
                    (input)="onEdit(index, $event)"
                  ></textarea>
                  @if (counterVisible(card)) {
                    <p id="mn-plot-count" class="counter" [class.is-over]="tooLong(card)">
                      {{ formatCount(length(card)) }} of {{ formatCount(limit) }} characters
                    </p>
                  }
                  @if (tooLong(card)) {
                    <p id="mn-plot-limit" class="mn-field-error" role="alert">
                      Remove {{ overBy(card) }} to continue.
                    </p>
                  } @else if (card.text.trim() === '') {
                    <p id="mn-plot-limit" class="mn-field-error" role="alert">
                      Write a plot to continue.
                    </p>
                  }
                </div>
              }
              @if (plots.selectedIndex() === index) {
                <div class="plot-tools">
                  <button
                    type="button"
                    class="mn-button mn-button--ghost"
                    data-testid="edit-plot"
                    data-edit-toggle
                    (click)="toggleEdit(index)"
                  >
                    @if (editing() === index) {
                      <mn-icon name="check" [size]="18" />
                      <span>Done</span>
                    } @else {
                      <mn-icon name="rename" [size]="18" />
                      <span>Edit</span>
                    }
                  </button>
                </div>
              }
            </div>
          }
        </fieldset>
      }

      @if (plots.isDrafting() && waitingLine(); as line) {
        <p class="waiting" role="status" data-testid="plot-waiting">{{ line }}</p>
      } @else if (plots.isDrafting()) {
        <p class="mn-visually-hidden" role="status">Writing new plots…</p>
      }
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

    .plots {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      min-width: 0;
      margin: 0;
      padding: 0;
      border: 0;
    }

    .plot {
      gap: var(--space-3);
      padding: var(--space-4);
      transition: background-color var(--motion-fast) var(--ease-standard);
    }

    /* Picked is the selection tint, the same one a pressed toggle wears. */
    .plot.is-selected {
      background: var(--action-primary-soft);
    }

    .plot-choice {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: var(--space-3);
      align-items: start;
      cursor: pointer;
    }

    .plot-choice input {
      margin-block-start: var(--control-check-offset);
    }

    .plot-body {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      min-width: 0;
    }

    .pills {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-1);
    }

    .plot-text {
      line-height: var(--leading-normal);
    }

    .plot-edit textarea {
      min-height: 8rem;
      resize: vertical;
    }

    .plot-tools {
      display: flex;
      justify-content: flex-end;
      margin-block: calc(var(--space-2) * -1);
      margin-inline-end: calc(var(--space-3) * -1);
    }

    .waiting {
      margin: 0;
      color: var(--text-secondary);
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

    fieldset:disabled .plot-choice {
      cursor: progress;
    }
  `,
})
export class StoryPlotsComponent {
  protected readonly plots = inject(StoryPlotStore);
  private readonly draft = inject(GenerationDraftStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  readonly disabled = input(false);

  protected readonly editing = signal<number | null>(null);
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

  protected readonly editDescriptionIds = computed(() => {
    const index = this.editing();
    const card = index === null ? undefined : this.plots.cards().at(index);
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

  protected choose(index: number): void {
    if (this.editing() !== index) {
      this.editing.set(null);
    }
    this.plots.select(index);
  }

  protected toggleEdit(index: number): void {
    if (this.editing() === index) {
      this.editing.set(null);
      this.focusAfterRender('[data-edit-toggle]');
      return;
    }
    this.editing.set(index);
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
