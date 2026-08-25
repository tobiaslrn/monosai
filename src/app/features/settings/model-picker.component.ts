import { NgTemplateOutlet } from '@angular/common';
import type { ElementRef } from '@angular/core';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import type { ModelCapabilities } from '../../domain/ai/model-catalog';

@Component({
  selector: 'mn-model-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:pointerdown)': 'closeFromOutside($event)',
    '(document:keydown.escape)': 'close()',
  },
  template: `
    <div class="picker">
      <button
        #trigger
        type="button"
        class="mn-control trigger"
        aria-haspopup="listbox"
        [attr.aria-expanded]="open()"
        [disabled]="disabled()"
        (click)="toggle()"
      >
        <span>
          <strong>{{ (selected()?.name ?? selectedId()) || placeholder() }}</strong>
          @if (selected(); as model) {
            <small>{{ model.modelId }}</small>
          }
        </span>
        <span aria-hidden="true">⌄</span>
      </button>

      @if (open()) {
        <div #panel class="panel" role="dialog" [attr.aria-label]="label()">
          <label class="search">
            <span class="mn-visually-hidden">Search {{ label() }}</span>
            <input
              class="mn-control"
              type="search"
              autocomplete="off"
              placeholder="Search by model or provider"
              [value]="query()"
              (input)="setQuery($event)"
            />
          </label>

          @if (favorites().length > 0) {
            <div class="favorites" aria-label="Favourite models">
              <p>Favourites</p>
              @for (model of favorites(); track model.modelId) {
                <ng-container
                  [ngTemplateOutlet]="modelRow"
                  [ngTemplateOutletContext]="{ $implicit: model }"
                />
              }
            </div>
          }

          <div class="results" role="listbox" [attr.aria-label]="label()">
            @if (loading()) {
              <p class="state" role="status">Loading OpenRouter models…</p>
            } @else if (failure()) {
              <p class="state error" role="alert">{{ failure() }}</p>
            } @else if (others().length === 0) {
              <p class="state">No matching models.</p>
            } @else {
              @for (model of others(); track model.modelId) {
                <ng-container
                  [ngTemplateOutlet]="modelRow"
                  [ngTemplateOutletContext]="{ $implicit: model }"
                />
              }
            }
          </div>
        </div>
      }
    </div>

    <ng-template #modelRow let-model>
      <div class="model-row" [class.is-selected]="model.modelId === selectedId()">
        <button
          type="button"
          class="model-choice"
          role="option"
          [attr.aria-selected]="model.modelId === selectedId()"
          (click)="choose(model)"
        >
          <strong>{{ model.name }}</strong>
          <small>{{ meta(model) }}</small>
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
  imports: [NgTemplateOutlet],
  styles: `
    .picker {
      position: relative;
    }
    .trigger {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      min-height: 3.5rem;
      text-align: left;
      cursor: pointer;
    }
    .trigger > span:first-child {
      display: grid;
      min-width: 0;
    }
    small {
      overflow: hidden;
      color: var(--text-secondary);
      font-size: 12px;
      font-weight: 400;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .panel {
      position: absolute;
      z-index: 20;
      inset: calc(100% + var(--space-1)) 0 auto;
      display: flex;
      flex-direction: column;
      max-height: min(28rem, 70vh);
      overflow: hidden;
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-control);
      background: var(--surface-panel);
      box-shadow: var(--shadow-overlay);
    }
    .search {
      padding: var(--space-2);
      border-bottom: 1px solid var(--border-subtle);
      background: var(--surface-panel);
    }
    .favorites {
      flex: none;
      max-height: 11rem;
      overflow: auto;
      border-bottom: 1px solid var(--border-subtle);
      background: var(--action-primary-soft);
    }
    .favorites p {
      position: sticky;
      z-index: 1;
      top: 0;
      margin: 0;
      padding: var(--space-2) var(--space-3) var(--space-1);
      background: var(--action-primary-soft);
      color: var(--action-primary);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .results {
      min-height: 3rem;
      overflow: auto;
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
    .model-row.is-selected {
      box-shadow: inset 3px 0 var(--action-primary);
    }
    .model-choice,
    .star {
      border: 0;
      background: transparent;
      color: inherit;
      font: inherit;
      cursor: pointer;
    }
    .model-choice {
      display: grid;
      gap: 2px;
      padding: var(--space-2) var(--space-3);
      text-align: left;
    }
    .model-choice:hover,
    .star:hover {
      background: var(--surface-sunken);
    }
    .star {
      min-width: var(--touch-target);
      color: var(--action-primary);
      font-size: 20px;
    }
    .state {
      margin: 0;
      padding: var(--space-4);
      color: var(--text-secondary);
      text-align: center;
    }
    .error {
      color: var(--status-danger);
    }
  `,
})
export class ModelPickerComponent {
  readonly label = input.required<string>();
  readonly placeholder = input('Choose a model');
  readonly models = input<readonly ModelCapabilities[]>([]);
  readonly favoriteIds = input<readonly string[]>([]);
  readonly selectedId = input('');
  readonly loading = input(false);
  readonly failure = input<string | null>(null);
  readonly disabled = input(false);
  readonly opened = output<void>();
  readonly modelSelected = output<ModelCapabilities>();
  readonly favoriteToggled = output<string>();

  protected readonly open = signal(false);
  protected readonly query = signal('');
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');

  protected readonly selected = computed(
    () => this.models().find((model) => model.modelId === this.selectedId()) ?? null,
  );
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

  protected toggle(): void {
    this.open.update((open) => !open);
    if (this.open()) this.opened.emit();
  }
  protected close(): void {
    this.open.set(false);
    this.query.set('');
  }
  protected closeFromOutside(event: PointerEvent): void {
    if (!this.open() || !(event.target instanceof Node)) return;
    if (this.panel()?.nativeElement.contains(event.target)) return;
    if (this.trigger().nativeElement.contains(event.target)) return;
    this.close();
  }
  protected setQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }
  protected choose(model: ModelCapabilities): void {
    this.modelSelected.emit(model);
    this.close();
  }
  protected isFavorite(modelId: string): boolean {
    return this.favoriteIds().includes(modelId);
  }
  protected meta(model: ModelCapabilities): string {
    const context = model.contextLength
      ? `${Math.round(model.contextLength / 1_000)}k context`
      : '';
    const reasoning = model.reasoning ? 'reasoning' : '';
    return [model.modelId, context, reasoning].filter(Boolean).join(' · ');
  }
}
