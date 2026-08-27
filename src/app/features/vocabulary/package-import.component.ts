import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import type { ElementRef } from '@angular/core';
import { PackageImportStore } from '../../application/vocabulary/package-import.store';
import { technicalCode } from '../../domain/shared/errors';
import { vocabularySourceId } from '../../domain/shared/ids';

/**
 * The incoming Anki package: quiet while it works, a chooser only when the
 * package leaves something genuinely open, and one clear line when it is done.
 */
@Component({
  selector: 'mn-package-import',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (state(); as current) {
      @switch (current.kind) {
        @case ('idle') {}
        @case ('complete') {
          <div class="panel" data-testid="package-import-complete">
            <p class="headline">
              {{ current.outcome.replaced ? 'Replaced' : 'Added' }}
              {{ current.outcome.deckName }} · {{ current.outcome.uniqueExpressions }} unique
              expressions
            </p>
            <div class="actions">
              <button type="button" class="mn-button" (click)="store.dismiss()">Dismiss</button>
            </div>
          </div>
        }
        @case ('cancelled') {
          <div class="panel" data-testid="package-import-cancelled">
            <p class="headline">Import cancelled. Your vocabulary is unchanged.</p>
            <div class="actions">
              <button type="button" class="mn-button" (click)="store.dismiss()">Dismiss</button>
            </div>
          </div>
        }
        @case ('failed') {
          <div class="panel is-failed" role="alert" data-testid="package-import-failed">
            <p class="headline">{{ current.error.message }}</p>
            <p class="mn-hint">
              Your current vocabulary and other sources are unchanged.
              @if (!current.canRetry) {
                Export the deck from Anki or AnkiDroid with scheduling information included, then
                add it again.
              }
            </p>
            <p class="mn-hint code">{{ code() }}</p>
            <div class="actions">
              @if (current.canRetry) {
                <button
                  type="button"
                  class="mn-button mn-button--primary"
                  (click)="store.retry()"
                  data-testid="package-import-retry"
                >
                  Try again
                </button>
              }
              <button type="button" class="mn-button" (click)="store.dismiss()">Dismiss</button>
            </div>
          </div>
        }
        @case ('selecting') {
          <div class="panel" data-testid="package-import-selection">
            <h3 #selectionHeading tabindex="-1">Choose what to import</h3>
            <p class="mn-hint">
              Monosai could not tell what this package should become, so nothing has been imported
              yet.
            </p>

            <div class="fields">
              @if (current.plan.deckOptions.length > 1) {
                <label class="mn-field">
                  <span>Deck</span>
                  <select
                    aria-label="Deck to import"
                    [value]="current.plan.selection.deckName"
                    (change)="store.chooseDeck(value($event))"
                    data-testid="package-import-deck"
                  >
                    @for (deck of current.plan.deckOptions; track deck.name) {
                      <option [value]="deck.name">{{ deck.name }}</option>
                    }
                  </select>
                </label>
              }
              @if (current.plan.noteTypeOptions.length > 1) {
                <label class="mn-field">
                  <span>Note type</span>
                  <select
                    aria-label="Note type to import"
                    [value]="current.plan.selection.noteTypeName"
                    (change)="store.chooseNoteType(value($event))"
                    data-testid="package-import-note-type"
                  >
                    @for (noteType of current.plan.noteTypeOptions; track noteType.name) {
                      <option [value]="noteType.name">{{ noteType.name }}</option>
                    }
                  </select>
                </label>
              }
              <label class="mn-field">
                <span>Expression field</span>
                <select
                  aria-label="Expression field"
                  [value]="current.plan.selection.expressionFieldName"
                  (change)="store.chooseExpressionField(value($event))"
                  data-testid="package-import-field"
                >
                  @for (field of fieldNames(); track field) {
                    <option [value]="field">{{ field }}</option>
                  }
                </select>
              </label>
              @if (current.plan.replaceOptions.length > 1) {
                <label class="mn-field">
                  <span>Replaces</span>
                  <select
                    aria-label="Source to replace"
                    [value]="current.plan.replaces?.id"
                    (change)="chooseReplacement($event)"
                    data-testid="package-import-replaces"
                  >
                    @for (option of current.plan.replaceOptions; track option.id) {
                      <option [value]="option.id">{{ option.label }}</option>
                    }
                  </select>
                </label>
              }
            </div>

            @if (deckHasChildren()) {
              <label class="check">
                <input
                  type="checkbox"
                  [checked]="current.plan.selection.deckScope === 'deck-and-subdecks'"
                  (change)="setScope($event)"
                />
                <span>Include subdecks</span>
              </label>
            }

            @if (current.plan.replaces; as replaced) {
              @if (current.plan.replaceOptions.length === 1) {
                <p class="mn-hint">Replaces {{ replaced.label }}.</p>
              }
            }

            <div class="actions">
              <button
                type="button"
                class="mn-button mn-button--primary"
                (click)="store.confirm()"
                data-testid="package-import-confirm"
              >
                Import vocabulary
              </button>
              <button type="button" class="mn-button" (click)="store.cancel()">Cancel</button>
            </div>
          </div>
        }
        @default {
          <div class="panel" data-testid="package-import-progress">
            <p class="headline">{{ progress() }}</p>
            @if (store.canCancel()) {
              <div class="actions">
                <button type="button" class="mn-button" (click)="store.cancel()">Cancel</button>
              </div>
            }
          </div>
        }
      }
    }
  `,
  styles: `
    .panel {
      display: grid;
      gap: var(--space-2);
      padding: var(--space-3);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-card);
      background: var(--surface-raised);
    }

    .panel.is-failed {
      border-color: var(--status-danger);
    }

    .headline,
    .panel h3 {
      margin: 0;
    }

    .fields {
      display: grid;
      gap: var(--space-2);
    }

    @media (min-width: 40rem) {
      .fields {
        grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
      }
    }

    .actions,
    .check {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      flex-wrap: wrap;
    }

    .code {
      font-family: var(--font-mono, monospace);
    }
  `,
})
export class PackageImportComponent {
  protected readonly store = inject(PackageImportStore);
  protected readonly state = this.store.state;
  private readonly selectionHeading = viewChild<ElementRef<HTMLElement>>('selectionHeading');

  protected readonly progress = computed(() => {
    const state = this.state();
    switch (state.kind) {
      case 'inspecting':
        return 'Reading the Anki package…';
      case 'importing':
        return state.examined > 0
          ? `Importing ${String(state.examined)} reviewed notes…`
          : 'Importing reviewed notes…';
      case 'committing':
        return 'Saving your vocabulary…';
      default:
        return '';
    }
  });

  protected readonly code = computed(() => {
    const state = this.state();
    return state.kind === 'failed' ? technicalCode(state.error) : '';
  });

  protected readonly fieldNames = computed(() => {
    const plan = this.store.plan();
    return (
      plan?.noteTypeOptions.find((noteType) => noteType.name === plan.selection.noteTypeName)
        ?.fieldNames ?? []
    );
  });

  protected readonly deckHasChildren = computed(() => {
    const plan = this.store.plan();
    return (
      plan?.deckOptions.find((deck) => deck.name === plan.selection.deckName)?.hasChildren === true
    );
  });

  constructor() {
    effect(() => {
      const heading = this.selectionHeading();
      if (this.state().kind === 'selecting' && heading !== undefined) {
        heading.nativeElement.focus();
      }
    });
  }

  protected value(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }

  protected chooseReplacement(event: Event): void {
    this.store.chooseReplacement(vocabularySourceId(this.value(event)));
  }

  protected setScope(event: Event): void {
    this.store.setDeckScope(
      (event.target as HTMLInputElement).checked ? 'deck-and-subdecks' : 'deck-only',
    );
  }
}
