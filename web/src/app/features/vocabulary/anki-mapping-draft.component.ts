import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AnkiConnectionStore } from '../../application/vocabulary/anki-connection.store';
import { ButtonDirective } from '../../shared-ui/button/button';
import { CardComponent } from '../../shared-ui/card/card.component';
import { ClusterComponent, StackComponent } from '../../shared-ui/layout/layout';
import { SelectComponent, optionsFromNames } from '../../shared-ui/select/select.component';
import { SettingsRowComponent } from '../../shared-ui/settings-row/settings-row.component';

@Component({
  selector: 'mn-anki-mapping-draft',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    ButtonDirective,
    CardComponent,
    ClusterComponent,
    SelectComponent,
    StackComponent,
    SettingsRowComponent,
  ],
  template: `
    @if (store.sampling()) {
      <mn-stack align="start">
        <p role="status">Checking which fields contain Japanese…</p>
        <button mnButton type="button" (click)="store.cancel()">Cancel</button>
      </mn-stack>
    }
    @if (store.selecting()) {
      <mn-card role="region" heading="Review Anki source">
        @if (!store.suggested()) {
          <p class="mn-hint">
            Monosai could not tell which field holds the Japanese. Choose the deck, note type, and
            expression field.
          </p>
        }
        <div class="mn-settings-group mn-settings-bleed">
          <mn-settings-row label="Deck" labelId="mn-anki-map-1-label">
            <mn-select
              labelledBy="mn-anki-map-1-label"
              label="Deck"
              [options]="deckOptions()"
              [ngModel]="store.selection().deckName"
              (ngModelChange)="store.change({ deckName: $event })"
              [disabled]="store.refresh.isBusy() && !store.preview()"
            />
          </mn-settings-row>
          <mn-settings-row label="Note type" labelId="mn-anki-map-2-label">
            <mn-select
              labelledBy="mn-anki-map-2-label"
              label="Note type"
              [options]="noteTypeOptions()"
              [ngModel]="store.selection().noteTypeName"
              (ngModelChange)="store.changeNoteType($event)"
              [disabled]="store.refresh.isBusy() && !store.preview()"
            />
          </mn-settings-row>
          <mn-settings-row label="Expression field" labelId="mn-anki-map-3-label">
            <mn-select
              labelledBy="mn-anki-map-3-label"
              label="Expression field"
              [options]="expressionFieldOptions()"
              [ngModel]="store.selection().expressionFieldName"
              (ngModelChange)="store.change({ expressionFieldName: $event })"
              [disabled]="store.refresh.isBusy() && !store.preview()"
            />
          </mn-settings-row>
          <mn-settings-row label="Meaning field" labelId="mn-anki-map-4-label">
            <mn-select
              labelledBy="mn-anki-map-4-label"
              label="Meaning field"
              [options]="meaningFieldOptions()"
              [ngModel]="store.selection().meaningFieldName ?? ''"
              (ngModelChange)="store.change({ meaningFieldName: $event || undefined })"
              [disabled]="store.refresh.isBusy() && !store.preview()"
            />
          </mn-settings-row>
        </div>
        @if (store.preview()) {
          @for (warning of store.preview()?.stats?.sourceWarnings; track $index) {
            <p class="mn-hint" role="status">{{ warning }}</p>
          }
          <p lang="ja">{{ store.sampleWords().join(' · ') || 'No reviewed words found.' }}</p>
          <p class="mn-hint">Your vocabulary stays unchanged until you confirm.</p>
        }
        <mn-cluster justify="end">
          <button
            type="button"
            mnButton="ghost"
            [disabled]="store.refresh.state().kind === 'committing'"
            (click)="store.cancel()"
          >
            Cancel
          </button>
          @if (store.preview()) {
            <button type="button" mnButton="primary" (click)="store.confirm()">
              Confirm vocabulary
            </button>
          } @else {
            <button
              type="button"
              mnButton="primary"
              [disabled]="!store.valid() || store.refresh.isBusy()"
              (click)="store.prepare()"
            >
              {{ store.refresh.isBusy() ? 'Reading vocabulary…' : 'Preview vocabulary' }}
            </button>
          }
        </mn-cluster>
      </mn-card>
    }
  `,
})
export class AnkiMappingDraftComponent {
  protected readonly store = inject(AnkiConnectionStore);
  protected readonly deckOptions = computed(() =>
    optionsFromNames(this.store.refresh.catalog()?.decks.map((deck) => deck.name) ?? [], {
      value: '',
      label: 'Choose a deck',
    }),
  );
  protected readonly noteTypeOptions = computed(() =>
    optionsFromNames(this.store.refresh.catalog()?.noteTypes.map((type) => type.name) ?? [], {
      value: '',
      label: 'Choose a note type',
    }),
  );
  protected readonly expressionFieldOptions = computed(() =>
    optionsFromNames(this.fields(), { value: '', label: 'Choose the Japanese field' }),
  );
  protected readonly meaningFieldOptions = computed(() =>
    optionsFromNames(this.fields(), { value: '', label: 'Not mapped' }),
  );
  protected readonly fields = computed(
    () =>
      this.store.refresh
        .catalog()
        ?.noteTypes.find((type) => type.name === this.store.selection().noteTypeName)?.fieldNames ??
      [],
  );
}
