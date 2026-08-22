import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { SourceMappingStore } from '../../application/vocabulary/source-mapping.store';
import { SnapshotHistoryStore } from '../../application/vocabulary/snapshot-history.store';
import { VocabularySyncService } from '../../application/vocabulary/vocabulary-sync.service';
import type { VocabularySourceId } from '../../domain/shared/ids';
import { parseTextList } from '../../domain/vocabulary/text-list-parser';
import { IconComponent } from '../../shared-ui/icon/icon.component';

@Component({
  selector: 'mn-text-list-source',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div class="intro">
      <div>
        <h3>Pasted list</h3>
        <p class="mn-hint">
          Paste one word or expression per line. Everything stays on this device.
        </p>
      </div>
      @if (!editing()) {
        <button type="button" class="mn-button" (click)="beginAdd()" data-testid="add-text-source">
          <mn-icon name="add" /> Add pasted list
        </button>
      }
    </div>

    @if (editing()) {
      <form class="editor" (submit)="save($event)" data-testid="text-source-editor">
        <label class="mn-field">
          <span>List name</span>
          <input
            type="text"
            maxlength="80"
            [value]="label()"
            (input)="setLabel($event)"
            placeholder="For example, Genki vocabulary"
          />
        </label>
        <label class="mn-field">
          <span>Vocabulary</span>
          <textarea
            rows="9"
            [value]="content()"
            (input)="setContent($event)"
            placeholder="猫&#10;食べる&#10;おはようございます"
            data-testid="text-source-content"
          ></textarea>
        </label>
        <p class="preview" aria-live="polite">
          {{ preview().entries.length }} non-empty entries
          @if (preview().duplicateLines > 0) {
            · {{ preview().duplicateLines }} exact duplicates will be merged
          }
          @if (preview().ignoredBlankLines > 0) {
            · {{ preview().ignoredBlankLines }} blank lines ignored
          }
        </p>
        @if (editorError(); as error) {
          <p class="error" role="alert">{{ error }}</p>
        }
        <div class="actions">
          <button
            type="submit"
            class="mn-button mn-button--primary"
            [disabled]="saving() || preview().entries.length === 0 || label().trim().length === 0"
            data-testid="save-text-source"
          >
            {{
              saving()
                ? 'Updating vocabulary…'
                : editingId() === null
                  ? 'Add to vocabulary'
                  : 'Save changes'
            }}
          </button>
          <button type="button" class="mn-button" [disabled]="saving()" (click)="cancelEdit()">
            Cancel
          </button>
        </div>
      </form>
    }

    <ul class="sources">
      @for (source of store.textLists(); track source.id) {
        <li class="source">
          <div>
            <strong>{{ source.label }}</strong>
            <p class="mn-hint">{{ countLines(source.content) }} entries · Pasted list</p>
          </div>
          <div class="source-actions">
            <label class="check">
              <input
                type="checkbox"
                [checked]="source.enabled"
                (change)="setEnabled(source.id, $event)"
              />
              <span>Use this source</span>
            </label>
            <button type="button" class="mn-button" (click)="beginEdit(source.id)">Edit</button>
            <button
              type="button"
              class="mn-button mn-button--danger"
              (click)="remove(source.id)"
              [attr.aria-label]="'Remove ' + source.label"
            >
              Remove
            </button>
          </div>
        </li>
      }
    </ul>

    <p class="mn-visually-hidden" role="status" aria-live="polite">{{ announcement() }}</p>
  `,
  styles: `
    .intro,
    .source,
    .source-actions,
    .actions,
    .check {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    .intro,
    .source {
      justify-content: space-between;
      align-items: flex-start;
      flex-wrap: wrap;
    }

    h3,
    p {
      margin: 0;
    }

    .editor {
      display: grid;
      gap: var(--space-2);
      margin-top: var(--space-3);
      padding: var(--space-3);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-card);
    }

    textarea {
      resize: vertical;
      min-height: 11rem;
      font-family: inherit;
    }

    .preview {
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    .error {
      color: var(--status-danger);
    }

    .sources {
      display: grid;
      gap: var(--space-2);
      margin: var(--space-3) 0 0;
      padding: 0;
      list-style: none;
    }

    .source {
      padding: var(--space-3);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-card);
    }

    .source-actions {
      flex-wrap: wrap;
    }

    .check {
      min-height: var(--touch-target);
      font-size: var(--text-sm);
    }
  `,
})
export class TextListSourceComponent {
  protected readonly store = inject(SourceMappingStore);
  private readonly sync = inject(VocabularySyncService);
  private readonly history = inject(SnapshotHistoryStore);

  protected readonly editingId = signal<VocabularySourceId | null>(null);
  protected readonly editing = signal(false);
  protected readonly label = signal('');
  protected readonly content = signal('');
  protected readonly saving = signal(false);
  protected readonly editorError = signal<string | null>(null);
  protected readonly announcement = signal('');
  protected readonly preview = computed(() => parseTextList(this.content()));

  protected beginAdd(): void {
    this.editingId.set(null);
    this.label.set('');
    this.content.set('');
    this.editorError.set(null);
    this.editing.set(true);
  }

  protected beginEdit(id: VocabularySourceId): void {
    const source = this.store.textLists().find((candidate) => candidate.id === id);
    if (source === undefined) {
      return;
    }
    this.editingId.set(id);
    this.label.set(source.label);
    this.content.set(source.content);
    this.editorError.set(null);
    this.editing.set(true);
  }

  protected cancelEdit(): void {
    this.editing.set(false);
    this.editorError.set(null);
  }

  protected setLabel(event: Event): void {
    this.label.set((event.target as HTMLInputElement).value);
  }

  protected setContent(event: Event): void {
    this.content.set((event.target as HTMLTextAreaElement).value);
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    const parsed = this.preview();
    const label = this.label().trim();
    if (label.length === 0 || parsed.entries.length === 0 || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.editorError.set(null);
    const id = this.editingId();
    const source =
      id === null
        ? await this.store.addTextList(label, parsed.normalizedContent)
        : await this.store.updateTextList(id, { label, content: parsed.normalizedContent });
    if (source === null) {
      this.editorError.set('The source could not be saved. Your current vocabulary is unchanged.');
      this.saving.set(false);
      return;
    }
    const applied = await this.sync.applyTextSource(source);
    if (!applied.ok) {
      this.editorError.set(`${applied.error.message} Your current vocabulary is unchanged.`);
      this.saving.set(false);
      return;
    }
    this.announcement.set(
      `Updated vocabulary from ${source.label}. ${String(applied.value.uniqueEntryCount)} unique expressions are current.`,
    );
    await this.history.load();
    this.saving.set(false);
    this.editing.set(false);
  }

  protected async setEnabled(id: VocabularySourceId, event: Event): Promise<void> {
    await this.store.setEnabled(id, (event.target as HTMLInputElement).checked);
    const rebuilt = await this.sync.rebuild();
    this.announcement.set(
      rebuilt.ok
        ? 'Updated the combined vocabulary.'
        : 'The source changed, but the vocabulary could not be rebuilt.',
    );
    if (rebuilt.ok) {
      await this.history.load();
    }
  }

  protected async remove(id: VocabularySourceId): Promise<void> {
    await this.store.remove(id);
    const rebuilt = await this.sync.rebuild();
    this.announcement.set(
      rebuilt.ok
        ? 'Removed the source and updated the vocabulary.'
        : 'The source was removed, but the vocabulary could not be rebuilt.',
    );
    if (rebuilt.ok) {
      await this.history.load();
    }
  }

  protected countLines(content: string): number {
    return parseTextList(content).entries.length;
  }
}
