import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import type { ElementRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PackageImportStore } from '../../application/vocabulary/package-import.store';
import { vocabularySourceId } from '../../domain/shared/ids';
import { ANKI_LINKS } from './anki-links';

/**
 * The incoming Anki package: quiet while it works, a chooser only when the
 * package leaves something genuinely open, and one clear line when it is done.
 */
@Component({
  selector: 'mn-package-import',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (state(); as current) {
      @switch (current.kind) {
        @case ('idle') {}
        @case ('complete') {
          <div class="mn-card" data-testid="package-import-complete">
            <p class="headline">
              {{ current.outcome.replaced ? 'Replaced' : 'Added' }}
              {{ current.outcome.deckName }} · {{ current.outcome.uniqueExpressions }} unique
              expressions
            </p>
            <div class="mn-actions">
              <button type="button" class="mn-button" (click)="store.dismiss()">Dismiss</button>
            </div>
          </div>
        }
        @case ('cancelled') {
          <div class="mn-card" data-testid="package-import-cancelled">
            <p class="headline">Import cancelled. Your vocabulary is unchanged.</p>
            <div class="mn-actions">
              <button type="button" class="mn-button" (click)="store.dismiss()">Dismiss</button>
            </div>
          </div>
        }
        @case ('failed') {
          <div class="mn-card" role="alert" data-testid="package-import-failed">
            <div class="mn-notice mn-notice--error">
              <div>
                <p class="headline">{{ current.error.message }}</p>
                <p>
                  Your current vocabulary and other sources are unchanged.
                  @if (!current.canRetry) {
                    Export the deck from Anki or AnkiDroid with scheduling information included,
                    then add it again —
                    <a [href]="links.ankiExporting" target="_blank" rel="noopener noreferrer"
                      >how to export</a
                    >.
                  }
                </p>
              </div>
            </div>
            <div class="mn-actions">
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
          <div class="mn-card" data-testid="package-import-selection">
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
                    [ngModel]="current.plan.selection.deckName"
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
                    [ngModel]="current.plan.selection.noteTypeName"
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
                  [ngModel]="current.plan.selection.expressionFieldName"
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
                    [ngModel]="current.plan.replaces?.id"
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

            <div class="mn-actions">
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
          <div class="mn-card" data-testid="package-import-progress">
            <p class="headline">{{ progress() }}</p>
            @if (store.canCancel()) {
              <div class="mn-actions">
                <button type="button" class="mn-button" (click)="store.cancel()">Cancel</button>
              </div>
            }
          </div>
        }
      }
    }
  `,
  styles: `
    @use '../../../styles/breakpoints' as breakpoints;

    .headline,
    h3 {
      margin: 0;
    }

    .fields {
      display: grid;
      gap: var(--space-2);
    }

    @media (min-width: breakpoints.$narrow) {
      .fields {
        grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
      }
    }

    .check {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      flex-wrap: wrap;
    }
  `,
})
export class PackageImportComponent {
  protected readonly store = inject(PackageImportStore);
  protected readonly state = this.store.state;
  protected readonly links = ANKI_LINKS;
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
