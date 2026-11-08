import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AnkiConnectionStore } from '../../application/vocabulary/anki-connection.store';
import { ButtonDirective } from '../../shared-ui/button/button';
import { CardComponent } from '../../shared-ui/card/card.component';
import { ClusterComponent, GridComponent, StackComponent } from '../../shared-ui/layout/layout';

@Component({
  selector: 'mn-anki-mapping-draft',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    ButtonDirective,
    CardComponent,
    ClusterComponent,
    GridComponent,
    StackComponent,
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
        <mn-grid [gap]="2">
          <label class="mn-field"
            ><span>Deck</span>
            <select
              [ngModel]="store.selection().deckName"
              (ngModelChange)="store.change({ deckName: $event })"
              [disabled]="store.refresh.isBusy() && !store.preview()"
            >
              <option value="">Choose a deck</option>
              @for (deck of store.refresh.catalog()?.decks; track deck.name) {
                <option [value]="deck.name">{{ deck.name }}</option>
              }
            </select>
          </label>
          <label class="mn-field"
            ><span>Note type</span>
            <select
              [ngModel]="store.selection().noteTypeName"
              (ngModelChange)="store.changeNoteType($event)"
              [disabled]="store.refresh.isBusy() && !store.preview()"
            >
              <option value="">Choose a note type</option>
              @for (type of store.refresh.catalog()?.noteTypes; track type.name) {
                <option [value]="type.name">{{ type.name }}</option>
              }
            </select>
          </label>
          <label class="mn-field"
            ><span>Expression field</span>
            <select
              [ngModel]="store.selection().expressionFieldName"
              (ngModelChange)="store.change({ expressionFieldName: $event })"
              [disabled]="store.refresh.isBusy() && !store.preview()"
            >
              <option value="">Choose the Japanese field</option>
              @for (field of fields(); track field) {
                <option [value]="field">{{ field }}</option>
              }
            </select>
          </label>
          <label class="mn-field"
            ><span>Meaning field</span>
            <select
              aria-label="Meaning field"
              [ngModel]="store.selection().meaningFieldName ?? ''"
              (ngModelChange)="store.change({ meaningFieldName: $event || undefined })"
              [disabled]="store.refresh.isBusy() && !store.preview()"
            >
              <option value="">Not mapped</option>
              @for (field of fields(); track field) {
                <option [value]="field">{{ field }}</option>
              }
            </select>
          </label>
        </mn-grid>
        @if (store.preview()) {
          @for (warning of store.preview()?.stats?.sourceWarnings; track $index) {
            <p class="mn-hint" role="status">{{ warning }}</p>
          }
          <p lang="ja">{{ store.sampleWords().join(' · ') || 'No reviewed words found.' }}</p>
          <p class="mn-hint">Your vocabulary stays unchanged until you confirm.</p>
        }
        <mn-cluster>
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
          <button
            type="button"
            mnButton
            [disabled]="store.refresh.state().kind === 'committing'"
            (click)="store.cancel()"
          >
            Cancel
          </button>
        </mn-cluster>
      </mn-card>
    }
  `,
})
export class AnkiMappingDraftComponent {
  protected readonly store = inject(AnkiConnectionStore);
  protected readonly fields = computed(
    () =>
      this.store.refresh
        .catalog()
        ?.noteTypes.find((type) => type.name === this.store.selection().noteTypeName)?.fieldNames ??
      [],
  );
}
