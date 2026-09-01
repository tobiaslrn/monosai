import { Dialog } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { SnapshotHistoryStore } from '../../application/vocabulary/snapshot-history.store';
import { ManualSourceSyncStore } from '../../application/vocabulary/manual-source-sync.store';
import { SourceMappingStore } from '../../application/vocabulary/source-mapping.store';
import { VocabularyRefreshStore } from '../../application/vocabulary/vocabulary-refresh.store';
import { VocabularySyncService } from '../../application/vocabulary/vocabulary-sync.service';
import type { StaleReason } from '../../domain/anki/mapping-validation';
import { technicalCode } from '../../domain/shared/errors';
import type { VocabularySourceId } from '../../domain/shared/ids';
import type { SourceMapping } from '../../domain/vocabulary/source-mapping';
import { describeSourceRemoval } from '../../domain/vocabulary/source-removal';
import type {
  AnkiVocabularySource,
  TextListVocabularySource,
  VocabularySource,
} from '../../domain/vocabulary/vocabulary-source';
import {
  isIncludedInVocabulary,
  supportsManualSync,
} from '../../domain/vocabulary/vocabulary-source';
import { openConfirmDialog } from '../../shared-ui/confirm-dialog/confirm-dialog.component';
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
            </div>
            <div class="source-actions">
              @if (source.kind === 'text-list') {
                <button type="button" class="mn-button" (click)="toggleEdit(source.id)">
                  {{ editingId() === source.id ? 'Close' : 'Edit' }}
                </button>
              }
              <button
                type="button"
                class="mn-button mn-button--danger"
                [disabled]="refresh.isBusy() || manual.isSyncing()"
                (click)="confirmRemove(source)"
                [attr.aria-label]="'Remove ' + source.label"
                data-testid="remove-source"
              >
                <mn-icon name="delete" /> Remove
              </button>
            </div>
          </div>

          <!--
            Inclusion is its own row, away from anything about syncing: the two
            were read as one control, and unticking the box to stop background
            reads emptied the vocabulary instead.
          -->
          <label class="check inclusion">
            <input
              type="checkbox"
              [checked]="isIncluded(source)"
              [disabled]="refresh.isBusy() || manual.isSyncing()"
              (change)="setIncluded(source.id, $event)"
              data-testid="include-source"
            />
            <span>Include in vocabulary</span>
          </label>

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

          @if (syncable(source)) {
            <div class="sync" role="group" [attr.aria-label]="'Syncing ' + source.label">
              <label class="check">
                <input
                  type="checkbox"
                  [checked]="source.automaticSync"
                  [disabled]="refresh.isBusy() || manual.isSyncing()"
                  (change)="setAutomaticSync(source.id, $event)"
                  data-testid="automatic-sync"
                />
                <span>Sync automatically</span>
              </label>
              @if (manual.isSyncingSource(source.id)) {
                <div class="sync-actions">
                  <span class="details">Syncing…</span>
                  <button type="button" class="mn-button" (click)="manual.cancel()">Cancel</button>
                </div>
              } @else {
                <button
                  type="button"
                  class="mn-button"
                  [disabled]="refresh.isBusy() || manual.isSyncing()"
                  (click)="syncNow(source)"
                  [attr.aria-label]="'Sync ' + source.label + ' now'"
                  data-testid="sync-now"
                >
                  Sync now
                </button>
              }
            </div>
            @if (syncFailure(source.id); as failure) {
              <p class="stale" role="alert" data-testid="sync-failed">
                {{ failure }} Your previous vocabulary is unchanged.
              </p>
            }
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

    .kind {
      padding: 0.2rem 0.5rem;
      border-radius: 999px;
      background: var(--surface-raised);
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    /* A rule, not decoration: it is what stops the two rows reading as one. */
    .sync {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: var(--space-2);
      padding-top: var(--space-2);
      border-top: 1px solid var(--border-subtle);
    }

    .sync-actions {
      display: flex;
      align-items: center;
      gap: var(--space-2);
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
  protected readonly manual = inject(ManualSourceSyncStore);
  private readonly sync = inject(VocabularySyncService);
  private readonly history = inject(SnapshotHistoryStore);
  private readonly dialog = inject(Dialog);

  protected readonly editingId = signal<VocabularySourceId | null>(null);
  protected readonly sourceChangeError = signal<string | null>(null);
  private readonly localAnnouncement = signal('');

  /**
   * One live region for the list.
   *
   * A manual sync owns it while it is running or has just finished, because it
   * is the thing the learner started; otherwise the source edits do.
   */
  protected readonly announcement = computed(() =>
    this.manual.state().kind === 'idle' ? this.localAnnouncement() : this.manual.announcement(),
  );
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

  protected isIncluded(source: VocabularySource): boolean {
    return isIncludedInVocabulary(source);
  }

  protected syncable(source: VocabularySource): source is AnkiVocabularySource {
    return supportsManualSync(source);
  }

  /** The message for a manual sync that failed against this source, with its code. */
  protected syncFailure(id: VocabularySourceId): string | null {
    const failure = this.manual.failureFor(id);
    return failure === null ? null : `${failure.message} (${technicalCode(failure)})`;
  }

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

  protected async setIncluded(id: VocabularySourceId, event: Event): Promise<void> {
    const included = readChecked(event);
    await this.store.setIncluded(id, included);
    await this.rebuildAfterSourceChange(
      included
        ? 'Included the source in your vocabulary.'
        : 'Left the source out of your vocabulary. It is still here, and its words come back when you include it again.',
    );
  }

  protected async setAutomaticSync(id: VocabularySourceId, event: Event): Promise<void> {
    const automatic = readChecked(event);
    await this.store.setAutomaticSync(id, automatic);
    this.localAnnouncement.set(
      automatic
        ? 'Monosai will read this source automatically.'
        : 'Automatic syncing is off for this source. Its words stay in your vocabulary.',
    );
  }

  /** Reads one source again on demand, then reloads what the page shows. */
  protected async syncNow(source: AnkiVocabularySource): Promise<void> {
    await this.manual.syncNow(source);
    if (this.manual.state().kind === 'complete') {
      await this.history.load();
    }
  }

  /**
   * Asks before removing a source, naming what goes with it.
   *
   * Removing is the one action here that cannot be undone: the stored read goes
   * with the source, and rebuilding it means connecting the source again. The
   * dialog opens with the safe answer focused, so the press that opened it
   * cannot carry through into confirming it.
   */
  protected async confirmRemove(source: VocabularySource): Promise<void> {
    const plan = describeSourceRemoval(source, {
      sources: this.store.sources(),
      storyCount: this.history.activeEntry()?.storyCount ?? 0,
    });
    const confirmed = await openConfirmDialog(this.dialog, {
      title: plan.title,
      message: 'This cannot be undone. It permanently removes:',
      details: plan.removes,
      footnote: `${plan.preserves.join(' and ')} are not affected. To keep the source but leave its words out, clear "Include in vocabulary" instead.`,
      confirmLabel: 'Remove permanently',
      cancelLabel: 'Keep it',
      tone: 'danger',
    });
    if (!confirmed) {
      return;
    }
    await this.store.remove(source.id);
    await this.rebuildAfterSourceChange('Removed the source and updated the vocabulary.');
  }

  private async applyConnectedSourceChange(): Promise<void> {
    await this.refresh.refreshAndCommit();
    if (this.refresh.state().kind === 'complete') {
      this.sourceChangeError.set(null);
      this.localAnnouncement.set('Updated the source and combined vocabulary.');
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
    this.localAnnouncement.set(successMessage);
    await this.history.load();
  }
}

function readValue(event: Event): string {
  return (event.target as HTMLSelectElement).value;
}

function readChecked(event: Event): boolean {
  return (event.target as HTMLInputElement).checked;
}
