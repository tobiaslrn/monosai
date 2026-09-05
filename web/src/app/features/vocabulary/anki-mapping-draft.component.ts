import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AnkiConnectionStore } from '../../application/vocabulary/anki-connection.store';

@Component({
  selector: 'mn-anki-mapping-draft',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    @if (store.sampling()) {
      <p role="status">Checking which fields contain Japanese…</p>
      <button type="button" class="mn-button" (click)="store.cancel()">Cancel</button>
    }
    @if (store.selecting()) {
      <section class="mn-panel" aria-label="Review Anki source">
        <h3>Review Anki source</h3>
        @if (!store.suggested()) {
          <p class="mn-hint">
            Monosai could not tell which field holds the Japanese. Choose the deck, note type, and
            expression field.
          </p>
        }
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
            (ngModelChange)="store.change({ noteTypeName: $event, expressionFieldName: '' })"
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
        @if (store.preview()) {
          @for (warning of store.preview()?.stats?.sourceWarnings; track $index) {
            <p class="mn-hint" role="status">{{ warning }}</p>
          }
          <p class="mn-hint">Words from this source:</p>
          <p lang="ja">{{ store.sampleWords().join(' · ') || 'No reviewed words found.' }}</p>
          <p class="mn-hint">Your vocabulary stays unchanged until you confirm.</p>
          <button type="button" class="mn-button mn-button--primary" (click)="store.confirm()">
            Confirm vocabulary
          </button>
        } @else {
          <button
            type="button"
            class="mn-button mn-button--primary"
            [disabled]="!store.valid() || store.refresh.isBusy()"
            (click)="store.prepare()"
          >
            {{ store.refresh.isBusy() ? 'Reading vocabulary…' : 'Preview vocabulary' }}
          </button>
        }
        <button
          type="button"
          class="mn-button"
          [disabled]="store.refresh.state().kind === 'committing'"
          (click)="store.cancel()"
        >
          Cancel
        </button>
      </section>
    }
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
    }
    section {
      display: grid;
      gap: var(--space-2);
    }
    h3,
    p {
      margin: 0;
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
