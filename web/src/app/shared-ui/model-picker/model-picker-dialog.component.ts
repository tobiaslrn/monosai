import type { Dialog } from '@angular/cdk/dialog';
import { DIALOG_DATA } from '@angular/cdk/dialog';
import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { declaredSpeechCapabilities } from '../../domain/ai/speech-capabilities';
import type { ModelCapabilities } from '../../domain/ai/model-catalog';
import { ButtonDirective } from '../button/button';
import { DialogComponent, dialogResult, openDialog } from '../dialog/dialog';
import { IconComponent } from '../icon/icon.component';
import { NoticeComponent } from '../notice/notice.component';

/**
 * What a picker is opened with. The lists are read as functions so the dialog
 * follows the catalogue as it loads and the favourites as they change; the
 * opener keeps the stores.
 */
export interface ModelPickerRequest {
  /** The row's name for what is chosen: "Text model". It titles the dialog. */
  readonly title: string;
  readonly models: () => readonly ModelCapabilities[];
  readonly favoriteIds: () => readonly string[];
  /** The id of the chosen model, or '' while the fallback or nothing is chosen. */
  readonly selectedId: () => string;
  readonly loading: () => boolean;
  readonly failure: () => string | null;
  /** The first option: choosing it clears the row's own choice ("Use the text model"). */
  readonly fallbackLabel?: string;
  /** Whether these are speech models, so each meta line can say how it takes its style. */
  readonly speech?: boolean;
  readonly toggleFavorite: (modelId: string) => void;
}

/** What closing the picker with a choice says. Closing without one says nothing. */
export type ModelPickerChoice =
  { readonly kind: 'model'; readonly model: ModelCapabilities } | { readonly kind: 'fallback' };

/**
 * Choosing a model from OpenRouter's catalogue: the searchable picker, a task
 * dialog of fixed height with the search pinned at its top. Favourites form a
 * group above all the others, the chosen option carries a check, and each
 * model's id is monospace on one line. Choosing closes it. The list is a
 * group of buttons, the chosen one marked current; a favourite's star is its own
 * control beside it. It is not a listbox, because a listbox holds nothing to press.
 */
@Component({
  selector: 'mn-model-picker-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonDirective, DialogComponent, IconComponent, NgTemplateOutlet, NoticeComponent],
  template: `
    <mn-dialog kind="picker" [heading]="request.title" headingId="mn-picker-title">
      <label class="mn-overlay__search" mn-dialog-pinned>
        <mn-icon name="search" />
        <span class="mn-visually-hidden">Search {{ request.title.toLocaleLowerCase() }}</span>
        <input
          type="search"
          autocomplete="off"
          cdkFocusInitial
          data-testid="model-picker-search"
          placeholder="Search by model or provider"
          [value]="query()"
          (input)="setQuery($event)"
        />
        @if (query() !== '') {
          <button
            type="button"
            mnButton="icon"
            class="clear"
            aria-label="Clear search"
            title="Clear search"
            (click)="query.set('')"
          >
            <mn-icon name="close" />
          </button>
        }
      </label>

      <div class="mn-overlay__options" role="group" [attr.aria-label]="request.title">
        @if (request.fallbackLabel; as fallback) {
          <button
            type="button"
            class="mn-dropdown-row fallback"
            data-testid="model-picker-fallback"
            [attr.aria-current]="request.selectedId() === '' ? 'true' : null"
            (click)="chooseFallback()"
          >
            <span class="mn-dropdown-row__words">
              <span class="mn-dropdown-row__label">{{ fallback }}</span>
            </span>
            @if (request.selectedId() === '') {
              <mn-icon class="mn-dropdown-row__check" name="check" tone="accent" />
            }
          </button>
        }

        @if (request.loading()) {
          <p class="mn-dropdown__state state" role="status">Loading models…</p>
        } @else if (request.failure(); as failure) {
          <mn-notice tone="error" role="alert"
            ><p>{{ failure }}</p></mn-notice
          >
        } @else {
          @if (favorites().length > 0) {
            <div class="favorites" role="group" aria-labelledby="mn-picker-favourites">
              <p class="mn-dropdown__group-title" id="mn-picker-favourites">Favourites</p>
              @for (model of favorites(); track model.modelId) {
                <ng-container
                  [ngTemplateOutlet]="modelRow"
                  [ngTemplateOutletContext]="{ $implicit: model }"
                />
              }
            </div>
          }
          @if (others().length > 0) {
            <div class="results" role="group" aria-labelledby="mn-picker-all">
              <p class="mn-dropdown__group-title" id="mn-picker-all">All models</p>
              @for (model of others(); track model.modelId) {
                <ng-container
                  [ngTemplateOutlet]="modelRow"
                  [ngTemplateOutletContext]="{ $implicit: model }"
                />
              }
            </div>
          } @else if (favorites().length === 0) {
            <p class="mn-dropdown__state state">No matching models.</p>
          }
        }
      </div>
    </mn-dialog>

    <ng-template #modelRow let-model>
      <div class="mn-dropdown-row">
        <button
          type="button"
          class="mn-dropdown-row__choice"
          [attr.data-testid]="'model-option-' + model.modelId"
          [attr.aria-current]="model.modelId === request.selectedId() ? 'true' : null"
          (click)="choose(model)"
        >
          <span class="mn-dropdown-row__words">
            <span class="mn-dropdown-row__label">{{ model.name }}</span>
            <small class="mn-dropdown-row__description mn-dropdown-row__line">
              <span class="mn-code">{{ model.modelId }}</span>
              @if (meta(model); as detail) {
                · {{ detail }}
              }
            </small>
          </span>
        </button>
        <button
          type="button"
          class="mn-dropdown-row__control star"
          [attr.aria-label]="
            isFavorite(model.modelId) ? 'Remove from favourites' : 'Add to favourites'
          "
          [attr.aria-pressed]="isFavorite(model.modelId)"
          (click)="toggleFavorite(model.modelId)"
        >
          <mn-icon name="star" />
        </button>
        <span class="mn-dropdown-row__mark">
          @if (model.modelId === request.selectedId()) {
            <mn-icon class="mn-dropdown-row__check" name="check" tone="accent" />
          }
        </span>
      </div>
    </ng-template>
  `,
})
export class ModelPickerDialogComponent {
  private readonly frame = viewChild.required(DialogComponent);
  protected readonly request = inject<ModelPickerRequest>(DIALOG_DATA);
  protected readonly query = signal('');

  protected readonly matches = computed(() => {
    const query = this.query().trim().toLocaleLowerCase();
    const models = this.request.models();
    if (query === '') return models;
    return models.filter((model) =>
      `${model.name} ${model.modelId}`.toLocaleLowerCase().includes(query),
    );
  });
  protected readonly favorites = computed(() =>
    this.matches().filter((model) => this.request.favoriteIds().includes(model.modelId)),
  );
  protected readonly others = computed(() =>
    this.matches().filter((model) => !this.request.favoriteIds().includes(model.modelId)),
  );

  protected setQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }
  protected choose(model: ModelCapabilities): void {
    this.frame().close({ kind: 'model', model } satisfies ModelPickerChoice);
  }
  protected chooseFallback(): void {
    this.frame().close({ kind: 'fallback' } satisfies ModelPickerChoice);
  }
  protected isFavorite(modelId: string): boolean {
    return this.request.favoriteIds().includes(modelId);
  }
  protected toggleFavorite(modelId: string): void {
    this.request.toggleFavorite(modelId);
  }

  /** What the model can take, after its id on the option's one muted line. */
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
    if (this.request.speech !== true) {
      return '';
    }
    return {
      prompted: 'style',
      none: 'no style',
    }[declaredSpeechCapabilities(model.modelId, model.supportedParameters).styleControl];
  }
}

/** Opens the picker and resolves to the learner's choice, or undefined when it was put away. */
export async function openModelPicker(
  dialog: Dialog,
  request: ModelPickerRequest,
): Promise<ModelPickerChoice | undefined> {
  const ref = openDialog<ModelPickerChoice, ModelPickerRequest, ModelPickerDialogComponent>(
    dialog,
    ModelPickerDialogComponent,
    { data: request, modal: true, labelledBy: 'mn-picker-title' },
  );
  return dialogResult(ref);
}
