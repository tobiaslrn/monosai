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
import { vocabularySourceId } from '../../domain/shared/ids';
import { formatCountOf } from '../../domain/shared/locale';
import { ANKI_LINKS } from './anki-links';
import {
  SelectComponent,
  optionsFromNames,
  type SelectOption,
  type SelectValue,
} from '../../shared-ui/select/select.component';
import { ButtonDirective } from '../../shared-ui/button/button';
import { CardComponent } from '../../shared-ui/card/card.component';
import { CheckboxComponent } from '../../shared-ui/checkbox/checkbox.component';
import { ClusterComponent } from '../../shared-ui/layout/layout';
import { NoticeComponent } from '../../shared-ui/notice/notice.component';

/**
 * The incoming Anki package: quiet while it works, a chooser only when the
 * package leaves something genuinely open, and one clear line when it is done.
 */
import { SettingsRowComponent } from '../../shared-ui/settings-row/settings-row.component';

@Component({
  selector: 'mn-package-import',
  imports: [
    ButtonDirective,
    CardComponent,
    CheckboxComponent,
    ClusterComponent,
    NoticeComponent,
    SelectComponent,
    SettingsRowComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (state(); as current) {
      @switch (current.kind) {
        @case ('idle') {}
        @case ('complete') {
          <mn-card data-testid="package-import-complete">
            <p>
              {{ current.outcome.replaced ? 'Replaced' : 'Added' }}
              {{ current.outcome.deckName }} ·
              {{ formatCountOf(current.outcome.uniqueExpressions, 'unique expression') }}
            </p>
            <mn-cluster>
              <button type="button" mnButton (click)="store.dismiss()">Dismiss</button>
            </mn-cluster>
          </mn-card>
        }
        @case ('cancelled') {
          <mn-card data-testid="package-import-cancelled">
            <p>Import cancelled. Your vocabulary is unchanged.</p>
            <mn-cluster>
              <button type="button" mnButton (click)="store.dismiss()">Dismiss</button>
            </mn-cluster>
          </mn-card>
        }
        @case ('failed') {
          <mn-card role="alert" data-testid="package-import-failed">
            <mn-notice tone="error">
              <p>{{ current.error.message }}</p>
              <p>
                Your current vocabulary and other sources are unchanged.
                @if (!current.canRetry) {
                  Export the deck from Anki or AnkiDroid with scheduling information included, then
                  add it again —
                  <a [href]="links.ankiExporting" target="_blank" rel="noopener noreferrer"
                    >how to export</a
                  >.
                }
              </p>
            </mn-notice>
            <mn-cluster>
              @if (current.canRetry) {
                <button
                  mnButton="primary"
                  type="button"
                  (click)="store.retry()"
                  data-testid="package-import-retry"
                >
                  Try again
                </button>
              }
              <button type="button" mnButton (click)="store.dismiss()">Dismiss</button>
            </mn-cluster>
          </mn-card>
        }
        @case ('selecting') {
          <mn-card data-testid="package-import-selection">
            <h3 #selectionHeading tabindex="-1">Choose what to import</h3>
            <p class="mn-hint">
              Monosai could not tell what this package should become, so nothing has been imported
              yet.
            </p>

            <div class="mn-settings-group mn-settings-bleed">
              @if (current.plan.deckOptions.length > 1) {
                <mn-settings-row label="Deck" labelId="mn-import-1-label">
                  <mn-select
                    labelledBy="mn-import-1-label"
                    label="Deck to import"
                    testId="package-import-deck"
                    [options]="deckChoices()"
                    [value]="current.plan.selection.deckName"
                    (valueChange)="store.chooseDeck(text($event))"
                  />
                </mn-settings-row>
              }
              @if (current.plan.noteTypeOptions.length > 1) {
                <mn-settings-row label="Note type" labelId="mn-import-2-label">
                  <mn-select
                    labelledBy="mn-import-2-label"
                    label="Note type to import"
                    testId="package-import-note-type"
                    [options]="noteTypeChoices()"
                    [value]="current.plan.selection.noteTypeName"
                    (valueChange)="store.chooseNoteType(text($event))"
                  />
                </mn-settings-row>
              }
              <mn-settings-row label="Expression field" labelId="mn-import-3-label">
                <mn-select
                  labelledBy="mn-import-3-label"
                  label="Expression field"
                  testId="package-import-field"
                  [options]="fieldChoices()"
                  [value]="current.plan.selection.expressionFieldName"
                  (valueChange)="store.chooseExpressionField(text($event))"
                />
              </mn-settings-row>
              @if (current.plan.replaceOptions.length > 1) {
                <mn-settings-row label="Replaces" labelId="mn-import-4-label">
                  <mn-select
                    labelledBy="mn-import-4-label"
                    label="Source to replace"
                    testId="package-import-replaces"
                    [options]="replaceChoices()"
                    [value]="current.plan.replaces?.id ?? ''"
                    (valueChange)="chooseReplacement($event)"
                  />
                </mn-settings-row>
              }
            </div>

            @if (deckHasChildren()) {
              <mn-checkbox
                [checked]="current.plan.selection.deckScope === 'deck-and-subdecks'"
                (checkedChange)="setScope($event)"
                >Include subdecks</mn-checkbox
              >
            }

            @if (current.plan.replaces; as replaced) {
              @if (current.plan.replaceOptions.length === 1) {
                <p class="mn-hint">Replaces {{ replaced.label }}.</p>
              }
            }

            <mn-cluster>
              <button
                mnButton="primary"
                type="button"
                (click)="store.confirm()"
                data-testid="package-import-confirm"
              >
                Import vocabulary
              </button>
              <button type="button" mnButton (click)="store.cancel()">Cancel</button>
            </mn-cluster>
          </mn-card>
        }
        @default {
          <mn-card data-testid="package-import-progress">
            <p>{{ progress() }}</p>
            @if (store.canCancel()) {
              <mn-cluster>
                <button type="button" mnButton (click)="store.cancel()">Cancel</button>
              </mn-cluster>
            }
          </mn-card>
        }
      }
    }
  `,
})
export class PackageImportComponent {
  protected readonly store = inject(PackageImportStore);
  protected readonly state = this.store.state;
  protected readonly links = ANKI_LINKS;
  protected readonly formatCountOf = formatCountOf;
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

  protected readonly deckChoices = computed(() =>
    optionsFromNames(this.store.plan()?.deckOptions.map((deck) => deck.name) ?? []),
  );
  protected readonly noteTypeChoices = computed(() =>
    optionsFromNames(this.store.plan()?.noteTypeOptions.map((noteType) => noteType.name) ?? []),
  );
  protected readonly fieldChoices = computed(() => optionsFromNames(this.fieldNames()));
  protected readonly replaceChoices = computed<readonly SelectOption<string>[]>(() =>
    (this.store.plan()?.replaceOptions ?? []).map((option) => ({
      value: option.id,
      label: option.label,
    })),
  );

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

  protected text(value: SelectValue): string {
    return String(value);
  }

  protected chooseReplacement(value: SelectValue): void {
    this.store.chooseReplacement(vocabularySourceId(String(value)));
  }

  protected setScope(includeSubdecks: boolean): void {
    this.store.setDeckScope(includeSubdecks ? 'deck-and-subdecks' : 'deck-only');
  }
}
