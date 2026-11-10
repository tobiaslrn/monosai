import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { declaredSpeechCapabilities } from '../../domain/ai/speech-capabilities';
import type { ModelCapabilities } from '../../domain/ai/model-catalog';
import { ViewportService } from '../../core/platform/viewport.service';
import { NoticeComponent } from '../notice/notice.component';
import { OverlayTriggerDirective, SheetPopoverComponent } from '../popover/sheet-popover.component';

@Component({
  selector: 'mn-model-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="mn-control mn-control--select trigger"
      [class.trigger--unset]="selectedId() === ''"
      aria-haspopup="listbox"
      [mnOverlayTrigger]="panel"
      [disabled]="disabled()"
    >
      @for (part of shownParts(); track $index) {
        <ng-container>{{ part }}<wbr /></ng-container>
      }
    </button>

    <mn-sheet-popover
      #panel="mnSheetPopover"
      role="dialog"
      headerWhen="docked"
      [heading]="title()"
      [fitAnchor]="true"
      [modal]="true"
      (opened)="opened.emit()"
      (closed)="reset()"
      (dismissed)="panel.hide()"
    >
      @if (panel.isOpen()) {
        <label class="search" mn-dialog-pinned>
          <span class="mn-visually-hidden">Search {{ label() }}</span>
          <input
            class="mn-control"
            type="search"
            autocomplete="off"
            data-testid="model-picker-search"
            placeholder="Search by model or provider"
            [attr.data-overlay-focus]="docked() ? null : ''"
            [value]="query()"
            (input)="setQuery($event)"
          />
        </label>
      }
      @if (panel.isOpen()) {
        @if (favorites().length > 0) {
          <div class="favorites" aria-label="Favourite models">
            <p class="mn-group-title">Favourites</p>
            @for (model of favorites(); track model.modelId) {
              <ng-container
                [ngTemplateOutlet]="modelRow"
                [ngTemplateOutletContext]="{ $implicit: model }"
              />
            }
          </div>
        }

        <div class="results" role="listbox" [attr.aria-label]="label()">
          @if (fallbackLabel(); as fallback) {
            <button
              type="button"
              class="fallback"
              data-testid="model-picker-fallback"
              role="option"
              [class.is-selected]="selectedId() === ''"
              [attr.aria-selected]="selectedId() === ''"
              (click)="chooseFallback()"
            >
              <strong>{{ fallback }}</strong>
            </button>
          }
          @if (loading()) {
            <p class="state" role="status">Loading OpenRouter models…</p>
          } @else if (failure()) {
            <mn-notice tone="error" role="alert"
              ><p>{{ failure() }}</p></mn-notice
            >
          } @else if (others().length === 0) {
            @if (favorites().length === 0) {
              <p class="state">No matching models.</p>
            }
          } @else {
            @for (model of others(); track model.modelId) {
              <ng-container
                [ngTemplateOutlet]="modelRow"
                [ngTemplateOutletContext]="{ $implicit: model }"
              />
            }
          }
        </div>
      }
    </mn-sheet-popover>

    <ng-template #modelRow let-model>
      <div class="model-row" [class.is-selected]="model.modelId === selectedId()">
        <button
          type="button"
          class="model-choice"
          role="option"
          [attr.data-testid]="'model-option-' + model.modelId"
          [attr.aria-selected]="model.modelId === selectedId()"
          (click)="choose(model)"
        >
          <strong>{{ model.name }}</strong>
          <!--
            The identifier is what the row exists to show, so it is never the
            half that is cut: only the numbers after it truncate.
          -->
          <small class="model-id">{{ model.modelId }}</small>
          <small class="model-meta">{{ meta(model) }}</small>
        </button>
        <button
          type="button"
          class="star"
          [attr.aria-label]="
            isFavorite(model.modelId) ? 'Remove from favourites' : 'Add to favourites'
          "
          [attr.aria-pressed]="isFavorite(model.modelId)"
          (click)="favoriteToggled.emit(model.modelId)"
        >
          {{ isFavorite(model.modelId) ? '★' : '☆' }}
        </button>
      </div>
    </ng-template>
  `,
  imports: [NgTemplateOutlet, NoticeComponent, OverlayTriggerDirective, SheetPopoverComponent],
  styles: `
    @use '../../../styles/motion' as motion;

    :host {
      display: block;
      min-width: 0;
    }

    /*
     * The trigger is a field like the select beside it: the same border,
     * height, radius, and chevron, and the value in the field's own weight.
     */
    .trigger {
      display: block;
      overflow: hidden;
      text-align: start;
      text-overflow: ellipsis;
      white-space: nowrap;
      cursor: pointer;
    }

    /* Nothing chosen yet is a prompt, not a value; it should not read as one. */
    .trigger--unset {
      color: var(--text-secondary);
    }

    /* On a line of its own, the full model name wraps rather than being cut. */
    @container (max-width: 16em) {
      .trigger {
        overflow-wrap: anywhere;
        white-space: normal;
      }
    }

    .search {
      display: block;
    }

    .search input {
      width: 100%;
    }

    /*
     * The rows reach the surface's edges, so a row's hover and its selection
     * mark span it, while their words keep the surface's inset.
     */
    .favorites,
    .results {
      margin-inline: calc(-1 * var(--overlay-inset));
    }

    .favorites {
      border-bottom: 1px solid var(--border-subtle);
    }

    .favorites p {
      margin: 0;
      padding: var(--space-2) var(--overlay-inset) var(--space-1);
    }

    .results {
      min-height: var(--touch-target);
    }

    .model-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) var(--touch-target);
      align-items: stretch;
      border-bottom: 1px solid var(--border-subtle);
    }

    .model-row:last-child {
      border-bottom: 0;
    }

    .model-row.is-selected,
    .fallback.is-selected {
      box-shadow: var(--shadow-model-indicator);
    }

    .model-choice,
    .star,
    .fallback {
      border: 0;
      background: transparent;
      color: inherit;
      font: inherit;
      cursor: pointer;
    }

    .model-choice {
      display: grid;
      gap: var(--line-gap);
      align-content: center;
      min-height: var(--touch-target);
      padding: var(--row-inset-block) 0 var(--row-inset-block) var(--overlay-inset);
      text-align: start;
    }

    :host-context(html[data-pointer='mouse']) .model-choice:hover,
    :host-context(html[data-pointer='mouse']) .star:hover,
    :host-context(html[data-pointer='mouse']) .fallback:hover {
      background: var(--surface-sunken);
    }

    .star {
      min-width: var(--touch-target);
      color: var(--action-primary);
      font-size: var(--text-xl);
    }

    /* A star the learner has just set pops once; the press left focus on it. */
    .star[aria-pressed='true']:focus {
      @include motion.emphasis;
    }

    .fallback {
      width: 100%;
      min-height: var(--touch-target);
      padding: var(--row-inset-block) var(--overlay-inset);
      border-bottom: 1px solid var(--border-subtle);
      text-align: start;
    }

    small {
      color: var(--text-secondary);
      font-size: var(--text-xs);
      font-weight: var(--weight-regular);
    }

    .model-id {
      color: var(--text-primary);
      overflow-wrap: anywhere;
    }

    .model-meta {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .state {
      margin: 0;
      padding: var(--overlay-inset);
      color: var(--text-secondary);
      text-align: center;
    }

    .results > mn-notice {
      margin: var(--space-2) var(--overlay-inset);
    }
  `,
})
export class ModelPickerComponent {
  readonly label = input.required<string>();
  readonly placeholder = input('Choose a model');
  readonly fallbackLabel = input<string | null>(null);
  readonly models = input<readonly ModelCapabilities[]>([]);
  readonly favoriteIds = input<readonly string[]>([]);
  readonly selectedId = input('');
  readonly selectedLabel = input<string | null>(null);
  readonly loading = input(false);
  readonly failure = input<string | null>(null);
  readonly disabled = input(false);
  /**
   * Whether these are speech models, so the meta line can name how each one
   * takes its style. Marking, never gating: a model with no direction channel is
   * still a fine cheap voice, and a catalog entry can change.
   */
  readonly speech = input(false);
  readonly opened = output<void>();
  readonly modelSelected = output<ModelCapabilities>();
  readonly favoriteToggled = output<string>();
  readonly fallbackSelected = output<void>();

  protected readonly query = signal('');
  private readonly popup = viewChild.required(SheetPopoverComponent);
  protected readonly docked = inject(ViewportService).isMobile;
  /** The overlay's name, and the docked sheet's title: what is being chosen from. */
  protected readonly title = computed(() => {
    const label = this.label();
    return label.charAt(0).toLocaleUpperCase() + label.slice(1);
  });

  protected readonly selected = computed(
    () => this.models().find((model) => model.modelId === this.selectedId()) ?? null,
  );
  /** The shown name in pieces split after each slash, the one place a vendor path may wrap. */
  protected readonly shownParts = computed(() => {
    const chosen = this.selected()?.name ?? this.selectedLabel() ?? this.selectedId();
    const shown = [chosen, this.fallbackLabel(), this.placeholder()].find(
      (label) => label !== null && label !== '',
    );
    return (shown ?? '').split(/(?<=\/)/);
  });
  protected readonly matches = computed(() => {
    const query = this.query().trim().toLocaleLowerCase();
    if (query === '') return this.models();
    return this.models().filter((model) =>
      `${model.name} ${model.modelId}`.toLocaleLowerCase().includes(query),
    );
  });
  protected readonly favorites = computed(() =>
    this.matches().filter((model) => this.favoriteIds().includes(model.modelId)),
  );
  protected readonly others = computed(() =>
    this.matches().filter((model) => !this.favoriteIds().includes(model.modelId)),
  );

  protected reset(): void {
    this.query.set('');
  }
  protected setQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }
  protected choose(model: ModelCapabilities): void {
    this.modelSelected.emit(model);
    this.popup().hide();
  }
  protected chooseFallback(): void {
    this.fallbackSelected.emit();
    this.popup().hide();
  }
  protected isFavorite(modelId: string): boolean {
    return this.favoriteIds().includes(modelId);
  }
  protected meta(model: ModelCapabilities): string {
    const context = model.contextLength
      ? `${Math.round(model.contextLength / 1_000)}k context`
      : '';
    const output = model.maxCompletionTokens
      ? `${Math.round(model.maxCompletionTokens / 1_000)}k output`
      : '';
    const reasoning = model.reasoning ? 'reasoning' : '';
    return [context, output, reasoning, this.pace(model)].filter(Boolean).join(' · ');
  }

  private pace(model: ModelCapabilities): string {
    if (!this.speech()) {
      return '';
    }
    return {
      prompted: 'style',
      none: 'no style',
    }[declaredSpeechCapabilities(model.modelId, model.supportedParameters).styleControl];
  }
}
