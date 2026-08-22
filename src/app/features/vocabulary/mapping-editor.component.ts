import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { SnapshotHistoryStore } from '../../application/vocabulary/snapshot-history.store';
import { SourceMappingStore } from '../../application/vocabulary/source-mapping.store';
import { VocabularyRefreshStore } from '../../application/vocabulary/vocabulary-refresh.store';
import { VocabularySyncService } from '../../application/vocabulary/vocabulary-sync.service';
import type { StaleReason } from '../../domain/anki/mapping-validation';
import type { SourceMappingId } from '../../domain/shared/ids';
import type { SourceMapping } from '../../domain/vocabulary/source-mapping';
import { IconComponent } from '../../shared-ui/icon/icon.component';

const STALE_REASONS: Record<StaleReason, string> = {
  'deck-missing': 'That deck is no longer in your collection.',
  'note-type-missing': 'That note type is no longer in your collection.',
  'field-missing': 'That field is no longer part of the note type.',
};

/**
 * The source mappings a refresh reads from.
 *
 * Every value comes from the discovered catalog: the deck, note type, and field
 * are all dropdowns, never free text, so a mapping cannot name something the
 * provider does not have. A mapping whose target has since disappeared is kept
 * and marked invalid rather than removed, because silently dropping it would
 * change what the next refresh reads without saying so.
 */
@Component({
  selector: 'mn-mapping-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    @if (!refresh.mappingEditorEnabled()) {
      <p class="mn-hint" data-testid="mapping-locked">
        Connect to a vocabulary source above to choose which decks and fields to read.
      </p>
    } @else {
      <ul class="mappings">
        @for (mapping of connectedMappings(); track mapping.id) {
          <li class="mapping" [class.is-stale]="staleReason(mapping.id) !== null">
            <div class="fields">
              <label class="mn-field">
                <span>Deck</span>
                <select
                  aria-label="Deck"
                  [value]="mapping.deckName"
                  (change)="setDeck(mapping, $event)"
                  [attr.aria-invalid]="staleReason(mapping.id) === 'deck-missing' ? 'true' : null"
                >
                  @for (deck of deckNames(); track deck) {
                    <option [value]="deck" [selected]="deck === mapping.deckName">
                      {{ deck }}
                    </option>
                  }
                </select>
              </label>

              <label class="mn-field">
                <span>Note type</span>
                <select
                  aria-label="Note type"
                  [value]="mapping.noteTypeName"
                  (change)="setNoteType(mapping, $event)"
                  [attr.aria-invalid]="
                    staleReason(mapping.id) === 'note-type-missing' ? 'true' : null
                  "
                >
                  @for (noteType of noteTypeNames(); track noteType) {
                    <option [value]="noteType" [selected]="noteType === mapping.noteTypeName">
                      {{ noteType }}
                    </option>
                  }
                </select>
              </label>

              <label class="mn-field">
                <span>Expression field</span>
                <select
                  aria-label="Expression field"
                  [value]="mapping.expressionFieldName"
                  (change)="setField(mapping, $event)"
                  [attr.aria-invalid]="staleReason(mapping.id) === 'field-missing' ? 'true' : null"
                >
                  @for (field of fieldsFor(mapping.noteTypeName); track field) {
                    <option [value]="field" [selected]="field === mapping.expressionFieldName">
                      {{ field }}
                    </option>
                  }
                </select>
              </label>
            </div>

            <div class="row">
              @if (hasChildren(mapping.deckName)) {
                <label class="check">
                  <input
                    type="checkbox"
                    [checked]="mapping.deckScope === 'deck-and-subdecks'"
                    (change)="setScope(mapping, $event)"
                  />
                  <span>Include subdecks of {{ mapping.deckName }}</span>
                </label>
              }

              <label class="check">
                <input
                  type="checkbox"
                  [checked]="mapping.enabled"
                  (change)="setEnabled(mapping, $event)"
                />
                <span>Use this source</span>
              </label>

              @if (mapping.kind === 'anki-connect') {
                <label class="check">
                  <input
                    type="checkbox"
                    [checked]="mapping.automaticSync"
                    (change)="setAutomaticSync(mapping, $event)"
                  />
                  <span>Sync automatically while Anki is available</span>
                </label>
              }

              <button
                type="button"
                class="mn-button mn-button--danger"
                (click)="remove(mapping.id)"
                [attr.aria-label]="
                  'Remove ' + mapping.deckName + ' ' + mapping.expressionFieldName + ' source'
                "
              >
                <mn-icon name="delete" />
                Remove
              </button>
            </div>

            @if (staleReason(mapping.id); as reason) {
              <p class="stale" role="alert">
                {{ staleMessage(reason) }} Repair it, switch it off, or remove it before refreshing.
              </p>
            }
          </li>
        } @empty {
          <li class="empty mn-hint">
            No sources yet. Add one to choose which deck and field Monosai reads.
          </li>
        }
      </ul>

      <button
        type="button"
        class="mn-button mn-button--primary"
        [disabled]="deckNames().length === 0 || refresh.isBusy()"
        (click)="add()"
        data-testid="add-mapping"
      >
        <mn-icon name="add" />
        Add a source
      </button>

      @if (sourceChangeError(); as error) {
        <p class="stale" role="alert">{{ error }}</p>
      }
      <p class="mn-visually-hidden" role="status" aria-live="polite">{{ announcement() }}</p>
    }
  `,
  styles: `
    .mappings {
      list-style: none;
      margin: 0 0 var(--space-3);
      padding: 0;
      display: grid;
      gap: var(--space-3);
    }

    .mapping {
      display: grid;
      gap: var(--space-2);
      padding: var(--space-3);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-card);
    }

    .mapping.is-stale {
      border-color: var(--status-danger);
    }

    /* Cards rather than a table, so nothing scrolls sideways at 320px. */
    .fields {
      display: grid;
      gap: var(--space-2);
    }

    @media (min-width: 720px) {
      .fields {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
    }

    .row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-3);
    }

    .check {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
      min-height: var(--touch-target);
      font-size: var(--text-sm);
    }

    .stale {
      margin: 0;
      color: var(--status-danger);
      font-size: var(--text-sm);
    }

    .empty {
      padding: var(--space-3);
      border: 1px dashed var(--border-subtle);
      border-radius: var(--radius-card);
    }
  `,
})
export class MappingEditorComponent {
  protected readonly store = inject(SourceMappingStore);
  protected readonly refresh = inject(VocabularyRefreshStore);
  private readonly sync = inject(VocabularySyncService);
  private readonly history = inject(SnapshotHistoryStore);
  protected readonly sourceChangeError = signal<string | null>(null);
  protected readonly announcement = signal('');

  protected readonly deckNames = computed(
    () => this.refresh.catalog()?.decks.map((deck) => deck.name) ?? [],
  );
  protected readonly noteTypeNames = computed(
    () => this.refresh.catalog()?.noteTypes.map((noteType) => noteType.name) ?? [],
  );
  protected readonly connectedMappings = computed(() => {
    const kind = this.refresh.providerKind();
    return kind === null
      ? []
      : this.store.mappings().filter((mapping) => mapping.providerKind === kind);
  });

  /**
   * Stale mappings, derived from the store's resolution.
   *
   * Because the resolution is itself derived from the mapping list and the
   * catalog, repairing a mapping clears its warning as soon as the change is
   * saved rather than when the next refresh runs.
   */
  private readonly staleById = computed(
    () =>
      new Map(
        (this.refresh.resolution()?.stale ?? []).map((entry) => [entry.mapping.id, entry.reason]),
      ),
  );

  protected staleReason(id: SourceMappingId): StaleReason | null {
    return this.staleById().get(id) ?? null;
  }

  protected staleMessage(reason: StaleReason): string {
    return STALE_REASONS[reason];
  }

  protected hasChildren(deckName: string): boolean {
    return (
      this.refresh.catalog()?.decks.find((deck) => deck.name === deckName)?.hasChildren === true
    );
  }

  protected fieldsFor(noteTypeName: string): readonly string[] {
    return (
      this.refresh.catalog()?.noteTypes.find((noteType) => noteType.name === noteTypeName)
        ?.fieldNames ?? []
    );
  }

  protected async add(): Promise<void> {
    const deck = this.deckNames().at(0);
    const noteType = this.noteTypeNames().at(0);
    if (deck === undefined || noteType === undefined) {
      return;
    }
    await this.store.add({
      providerKind: this.refresh.providerKind() ?? 'package',
      deckName: deck,
      deckScope: 'deck-only',
      noteTypeName: noteType,
      expressionFieldName: this.fieldsFor(noteType)[0] ?? '',
    });
  }

  protected async setDeck(mapping: SourceMapping, event: Event): Promise<void> {
    await this.store.update(mapping.id, { deckName: readValue(event) });
  }

  /**
   * Changing the note type re-picks the field.
   *
   * The old field almost certainly does not exist on the new note type, and
   * leaving it would make the mapping instantly stale for a reason the learner
   * did not cause.
   */
  protected async setNoteType(mapping: SourceMapping, event: Event): Promise<void> {
    const noteTypeName = readValue(event);
    const fields = this.fieldsFor(noteTypeName);
    const expressionFieldName = fields.includes(mapping.expressionFieldName)
      ? mapping.expressionFieldName
      : (fields[0] ?? '');
    await this.store.update(mapping.id, { noteTypeName, expressionFieldName });
  }

  protected async setField(mapping: SourceMapping, event: Event): Promise<void> {
    await this.store.update(mapping.id, { expressionFieldName: readValue(event) });
  }

  protected async setScope(mapping: SourceMapping, event: Event): Promise<void> {
    await this.store.update(mapping.id, {
      deckScope: readChecked(event) ? 'deck-and-subdecks' : 'deck-only',
    });
  }

  protected async setEnabled(mapping: SourceMapping, event: Event): Promise<void> {
    await this.store.setEnabled(mapping.id, readChecked(event));
    await this.rebuildAfterSourceChange('Updated the combined vocabulary.');
  }

  protected async setAutomaticSync(mapping: SourceMapping, event: Event): Promise<void> {
    await this.store.setAutomaticSync(mapping.id, readChecked(event));
  }

  protected async remove(id: SourceMappingId): Promise<void> {
    await this.store.remove(id);
    await this.rebuildAfterSourceChange('Removed the source and updated the vocabulary.');
  }

  private async rebuildAfterSourceChange(successMessage: string): Promise<void> {
    const rebuilt = await this.sync.rebuild();
    if (!rebuilt.ok) {
      this.sourceChangeError.set(
        `${rebuilt.error.message} The previous current vocabulary is unchanged.`,
      );
      return;
    }
    this.sourceChangeError.set(null);
    this.announcement.set(successMessage);
    await this.history.load();
  }
}

function readValue(event: Event): string {
  return (event.target as HTMLSelectElement).value;
}

function readChecked(event: Event): boolean {
  return (event.target as HTMLInputElement).checked;
}
