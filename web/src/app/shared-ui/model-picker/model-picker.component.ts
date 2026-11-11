import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { declaredSpeechCapabilities } from '../../domain/ai/speech-capabilities';
import type { ModelCapabilities } from '../../domain/ai/model-catalog';
import { DropdownComponent } from '../dropdown/dropdown.component';
import { IconComponent } from '../icon/icon.component';
import { NoticeComponent } from '../notice/notice.component';

/**
 * Choosing a model from OpenRouter's catalogue. Its trigger is the select's
 * (`.mn-choice`: the value and the up-down chevron, the whole row in a settings
 * row) and its list is the app's one dropdown (`mn-dropdown`), with a search as its first row and a
 * favourite star beside each option's check; the list scrolls under the search.
 */
@Component({
  selector: 'mn-model-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="mn-choice"
      role="combobox"
      aria-haspopup="listbox"
      [attr.aria-label]="labelledBy() === null ? title() : null"
      [attr.aria-labelledby]="labelledBy()"
      [attr.popovertarget]="panel.id"
      [attr.aria-controls]="panel.id"
      [attr.aria-expanded]="panel.isOpen()"
      [disabled]="disabled()"
    >
      <span class="mn-choice__value">
        @for (part of shownParts(); track $index) {
          <ng-container>{{ part }}<wbr /></ng-container>
        }
        @if (codeParts().length > 0) {
          <span aria-hidden="true"> · </span>
          <span class="mn-choice__code">
            @for (part of codeParts(); track $index) {
              <ng-container>{{ part }}<wbr /></ng-container>
            }
          </span>
        }
      </span>
      <mn-icon name="chevron-right" />
    </button>

    <mn-dropdown #panel="mnDropdown" [label]="title()" (opened)="opened.emit()" (closed)="reset()">
      @if (panel.isOpen()) {
        <label class="mn-dropdown__search" mn-dropdown-pinned>
          <mn-icon name="search" />
          <span class="mn-visually-hidden">Search {{ label() }}</span>
          <input
            type="search"
            autocomplete="off"
            data-testid="model-picker-search"
            placeholder="Search by model or provider"
            data-overlay-focus
            [value]="query()"
            (input)="setQuery($event)"
          />
        </label>
      }
      <!-- Its own block: a block of one element is projected by that element's slot. -->
      @if (panel.isOpen()) {
        @if (favorites().length > 0) {
          <div class="favorites" aria-label="Favourite models">
            <p class="mn-dropdown__group-title">Favourites</p>
            @for (model of favorites(); track model.modelId) {
              <ng-container
                [ngTemplateOutlet]="modelRow"
                [ngTemplateOutletContext]="{ $implicit: model }"
              />
            }
          </div>
        }

        @if (favorites().length > 0 && (others().length > 0 || fallbackLabel())) {
          <hr class="mn-dropdown__separator" />
        }
        <div class="results" role="listbox" [attr.aria-label]="label()">
          @if (fallbackLabel(); as fallback) {
            <button
              type="button"
              class="mn-dropdown-row fallback"
              data-testid="model-picker-fallback"
              role="option"
              [attr.aria-selected]="selectedId() === ''"
              (click)="chooseFallback()"
            >
              <span class="mn-dropdown-row__words">
                <span class="mn-dropdown-row__label">{{ fallback }}</span>
              </span>
              @if (selectedId() === '') {
                <mn-icon class="mn-dropdown-row__check" name="check" tone="accent" />
              }
            </button>
            @if (others().length > 0) {
              <hr class="mn-dropdown__separator" />
            }
          }
          @if (loading()) {
            <p class="mn-dropdown__state state" role="status">Loading OpenRouter models…</p>
          } @else if (failure()) {
            <mn-notice tone="error" role="alert"
              ><p>{{ failure() }}</p></mn-notice
            >
          } @else if (others().length === 0) {
            @if (favorites().length === 0) {
              <p class="mn-dropdown__state state">No matching models.</p>
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
    </mn-dropdown>

    <ng-template #modelRow let-model>
      <div class="mn-dropdown-row">
        <button
          type="button"
          class="mn-dropdown-row__choice"
          role="option"
          [attr.data-testid]="'model-option-' + model.modelId"
          [attr.aria-selected]="model.modelId === selectedId()"
          (click)="choose(model)"
        >
          <span class="mn-dropdown-row__words">
            <span class="mn-dropdown-row__label">{{ model.name }}</span>
            <!-- The identifier is what the row exists to show, so it leads the line. -->
            <small class="mn-dropdown-row__description">{{ description(model) }}</small>
          </span>
        </button>
        <button
          type="button"
          class="mn-dropdown-row__control star"
          [attr.aria-label]="
            isFavorite(model.modelId) ? 'Remove from favourites' : 'Add to favourites'
          "
          [attr.aria-pressed]="isFavorite(model.modelId)"
          (click)="favoriteToggled.emit(model.modelId)"
        >
          <mn-icon name="star" />
        </button>
        <span class="mn-dropdown-row__mark">
          @if (model.modelId === selectedId()) {
            <mn-icon class="mn-dropdown-row__check" name="check" tone="accent" />
          }
        </span>
      </div>
    </ng-template>
  `,
  imports: [DropdownComponent, IconComponent, NgTemplateOutlet, NoticeComponent],
  styles: `
    .favorites,
    .results {
      display: flex;
      flex-direction: column;
    }

    .results {
      display: flex;
      flex-direction: column;
    }

    .results {
      min-height: var(--touch-target);
    }

    .results > mn-notice {
      margin: var(--row-inset-block) var(--dropdown-row-inset);
    }
  `,
})
export class ModelPickerComponent {
  readonly label = input.required<string>();
  /** The id of the visible label that names the picker, as a settings row gives it. */
  readonly labelledBy = input<string | null>(null);
  readonly placeholder = input('Choose a model');
  /** The list's fallback option: choosing it clears the picker's own choice. */
  readonly fallbackLabel = input<string | null>(null);
  /**
   * What the trigger says while the fallback is in force: the value that will
   * actually apply, muted because it is inherited rather than chosen. Without
   * it the trigger names the fallback option itself.
   */
  readonly inheritedLabel = input<string | null>(null);
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
  private readonly popup = viewChild.required(DropdownComponent);
  /** The dropdown's name: what is being chosen from. */
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
    const shown = [
      chosen,
      this.selectedId() === '' ? this.inheritedLabel() : null,
      this.fallbackLabel(),
      this.placeholder(),
    ].find((label) => label !== null && label !== '');
    return (shown ?? '').split(/(?<=\/)/);
  });
  /** The chosen model's identifier, in pieces, when the name shown is not already it. */
  protected readonly codeParts = computed(() => {
    const id = this.selectedId();
    const shownName = this.selected()?.name ?? this.selectedLabel() ?? id;
    return id === '' || shownName === id ? [] : id.split(/(?<=\/)/);
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
  /** The option's one muted line: its identifier, then what it can take. */
  protected description(model: ModelCapabilities): string {
    return [model.modelId, this.meta(model)].filter(Boolean).join(' · ');
  }
  private meta(model: ModelCapabilities): string {
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
