import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { SnapshotHistoryStore } from '../../application/vocabulary/snapshot-history.store';
import { SourceMappingStore } from '../../application/vocabulary/source-mapping.store';
import { VocabularyRefreshStore } from '../../application/vocabulary/vocabulary-refresh.store';
import { VocabularySyncService } from '../../application/vocabulary/vocabulary-sync.service';
import type { StaleReason } from '../../domain/anki/mapping-validation';
import type { VocabularySourceId } from '../../domain/shared/ids';
import type { SourceMapping } from '../../domain/vocabulary/source-mapping';
import type {
  TextListVocabularySource,
  VocabularySource,
} from '../../domain/vocabulary/vocabulary-source';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import { TextListSourceComponent } from './text-list-source.component';

const STALE_REASONS: Record<StaleReason, string> = {
  'deck-missing': 'That deck is no longer in your collection.',
  'note-type-missing': 'That note type is no longer in your collection.',
  'field-missing': 'That field is no longer part of the note type.',
};

/** One list for every source, with shared lifecycle controls and source-specific settings. */
@Component({
  selector: 'mn-mapping-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, TextListSourceComponent],
  template: `
    <ul class="sources">
      @for (source of store.sources(); track source.id) {
        <li class="source" [class.is-stale]="isStale(source)">
          <div class="source-head">
            <div class="identity">
              <strong>{{ source.label }}</strong>
              <span class="kind">{{ kindLabel(source) }}</span>
              @if (source.kind === 'anki-connect' && source.automaticSync) {
                <span class="sync-badge">Auto-sync</span>
              }
            </div>
            <div class="source-actions">
              <label class="check">
                <input
                  type="checkbox"
                  [checked]="source.enabled"
                  [disabled]="refresh.isBusy()"
                  (change)="setEnabled(source.id, $event)"
                />
                <span>Enabled</span>
              </label>
              @if (source.kind === 'text-list') {
                <button type="button" class="mn-button" (click)="toggleEdit(source.id)">
                  {{ editingId() === source.id ? 'Close' : 'Edit' }}
                </button>
              }
              <button
                type="button"
                class="mn-button mn-button--danger"
                [disabled]="refresh.isBusy()"
                (click)="remove(source.id)"
                [attr.aria-label]="'Remove ' + source.label"
              >
                <mn-icon name="delete" /> Remove
              </button>
            </div>
          </div>

          @if (source.kind === 'text-list') {
            @if (editingId() === source.id) {
              <mn-text-list-source
                [source]="source"
                (saved)="finishEdit()"
                (cancelled)="finishEdit()"
              />
            } @else {
              <p class="details">{{ textEntryCount(source) }} entries</p>
            }
          } @else if (canConfigure(source)) {
            <div class="fields">
              <label class="mn-field">
                <span>Deck</span>
                <select
                  aria-label="Deck"
                  [disabled]="refresh.isBusy()"
                  [value]="source.deckName"
                  (change)="setDeck(source, $event)"
                >
                  @for (deck of deckNames(); track deck) {
                    <option [value]="deck">{{ deck }}</option>
                  }
                </select>
              </label>
              <label class="mn-field">
                <span>Note type</span>
                <select
                  aria-label="Note type"
                  [disabled]="refresh.isBusy()"
                  [value]="source.noteTypeName"
                  (change)="setNoteType(source, $event)"
                >
                  @for (noteType of noteTypeNames(); track noteType) {
                    <option [value]="noteType">{{ noteType }}</option>
                  }
                </select>
              </label>
              <label class="mn-field">
                <span>Expression field</span>
                <select
                  aria-label="Expression field"
                  [disabled]="refresh.isBusy()"
                  [value]="source.expressionFieldName"
                  (change)="setField(source, $event)"
                >
                  @for (field of fieldsFor(source.noteTypeName); track field) {
                    <option [value]="field">{{ field }}</option>
                  }
                </select>
              </label>
            </div>
            @if (hasChildren(source.deckName)) {
              <label class="check subdecks">
                <input
                  type="checkbox"
                  [disabled]="refresh.isBusy()"
                  [checked]="source.deckScope === 'deck-and-subdecks'"
                  (change)="setScope(source, $event)"
                />
                <span>Include subdecks</span>
              </label>
            }
          } @else {
            <p class="details">
              {{ source.deckName }} · {{ source.noteTypeName }} · {{ source.expressionFieldName }}
            </p>
          }

          @if (staleReason(source); as reason) {
            <p class="stale" role="alert">
              {{ staleMessage(reason) }} Reconnect this source to repair it.
            </p>
          }
        </li>
      } @empty {
        <li class="empty mn-hint" data-testid="mapping-locked">No sources yet.</li>
      }
    </ul>

    @if (sourceChangeError(); as error) {
      <p class="stale" role="alert">{{ error }}</p>
    }
    <p class="mn-visually-hidden" role="status" aria-live="polite">{{ announcement() }}</p>
  `,
  styles: `
    .source-head,
    .identity,
    .source-actions,
    .check {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    .source-head {
      justify-content: space-between;
    }

    .details,
    .stale {
      margin: 0;
    }

    .sources {
      display: grid;
      gap: var(--space-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .source {
      display: grid;
      gap: var(--space-3);
      padding: var(--space-3);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-card);
    }

    .source.is-stale {
      border-color: var(--status-danger);
    }

    .source-head,
    .source-actions {
      flex-wrap: wrap;
    }

    .kind,
    .sync-badge {
      padding: 0.2rem 0.5rem;
      border-radius: 999px;
      background: var(--surface-raised);
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    .sync-badge {
      background: var(--status-success-soft);
      color: var(--status-success);
      font-weight: 600;
    }

    .fields {
      display: grid;
      gap: var(--space-2);
    }

    @media (min-width: 720px) {
      .fields {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
    }

    .check {
      min-height: var(--touch-target);
      font-size: var(--text-sm);
    }

    .details {
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    .stale {
      color: var(--status-danger);
      font-size: var(--text-sm);
    }

    .empty {
      padding: var(--space-4);
      border: 1px dashed var(--border-subtle);
      border-radius: var(--radius-card);
      text-align: center;
    }
  `,
})
export class MappingEditorComponent {
  protected readonly store = inject(SourceMappingStore);
  protected readonly refresh = inject(VocabularyRefreshStore);
  private readonly sync = inject(VocabularySyncService);
  private readonly history = inject(SnapshotHistoryStore);

  protected readonly editingId = signal<VocabularySourceId | null>(null);
  protected readonly sourceChangeError = signal<string | null>(null);
  protected readonly announcement = signal('');
  protected readonly deckNames = computed(
    () => this.refresh.catalog()?.decks.map((deck) => deck.name) ?? [],
  );
  protected readonly noteTypeNames = computed(
    () => this.refresh.catalog()?.noteTypes.map((noteType) => noteType.name) ?? [],
  );
  private readonly staleById = computed(
    () =>
      new Map(
        (this.refresh.resolution()?.stale ?? []).map((entry) => [entry.mapping.id, entry.reason]),
      ),
  );

  protected kindLabel(source: VocabularySource): string {
    switch (source.kind) {
      case 'anki-connect':
        return 'Anki';
      case 'anki-package':
        return 'Anki package';
      case 'text-list':
        return 'Pasted list';
    }
  }

  protected canConfigure(source: SourceMapping): boolean {
    return (
      this.refresh.providerKind() === source.providerKind && this.refresh.mappingEditorEnabled()
    );
  }

  protected isStale(source: VocabularySource): boolean {
    return source.kind !== 'text-list' && this.staleById().has(source.id);
  }

  protected staleReason(source: VocabularySource): StaleReason | null {
    return source.kind === 'text-list' ? null : (this.staleById().get(source.id) ?? null);
  }

  protected staleMessage(reason: StaleReason): string {
    return STALE_REASONS[reason];
  }

  protected fieldsFor(noteTypeName: string): readonly string[] {
    return (
      this.refresh.catalog()?.noteTypes.find((noteType) => noteType.name === noteTypeName)
        ?.fieldNames ?? []
    );
  }

  protected hasChildren(deckName: string): boolean {
    return (
      this.refresh.catalog()?.decks.find((deck) => deck.name === deckName)?.hasChildren === true
    );
  }

  protected textEntryCount(source: TextListVocabularySource): number {
    return source.content.split('\n').filter((line) => line.trim().length > 0).length;
  }

  protected toggleEdit(id: VocabularySourceId): void {
    this.editingId.update((current) => (current === id ? null : id));
  }

  protected finishEdit(): void {
    this.editingId.set(null);
  }

  protected async setDeck(source: SourceMapping, event: Event): Promise<void> {
    await this.store.update(source.id, { deckName: readValue(event) });
    await this.applyConnectedSourceChange();
  }

  protected async setNoteType(source: SourceMapping, event: Event): Promise<void> {
    const noteTypeName = readValue(event);
    const fields = this.fieldsFor(noteTypeName);
    await this.store.update(source.id, {
      noteTypeName,
      expressionFieldName: fields.includes(source.expressionFieldName)
        ? source.expressionFieldName
        : (fields[0] ?? ''),
    });
    await this.applyConnectedSourceChange();
  }

  protected async setField(source: SourceMapping, event: Event): Promise<void> {
    await this.store.update(source.id, { expressionFieldName: readValue(event) });
    await this.applyConnectedSourceChange();
  }

  protected async setScope(source: SourceMapping, event: Event): Promise<void> {
    await this.store.update(source.id, {
      deckScope: readChecked(event) ? 'deck-and-subdecks' : 'deck-only',
    });
    await this.applyConnectedSourceChange();
  }

  protected async setEnabled(id: VocabularySourceId, event: Event): Promise<void> {
    await this.store.setEnabled(id, readChecked(event));
    await this.rebuildAfterSourceChange('Updated the combined vocabulary.');
  }

  protected async remove(id: VocabularySourceId): Promise<void> {
    await this.store.remove(id);
    await this.rebuildAfterSourceChange('Removed the source and updated the vocabulary.');
  }

  private async applyConnectedSourceChange(): Promise<void> {
    await this.refresh.refreshAndCommit();
    if (this.refresh.state().kind === 'complete') {
      this.sourceChangeError.set(null);
      this.announcement.set('Updated the source and combined vocabulary.');
      await this.history.load();
    }
  }

  private async rebuildAfterSourceChange(successMessage: string): Promise<void> {
    const rebuilt = await this.sync.rebuild();
    if (!rebuilt.ok) {
      this.sourceChangeError.set(`${rebuilt.error.message} The previous vocabulary is unchanged.`);
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
