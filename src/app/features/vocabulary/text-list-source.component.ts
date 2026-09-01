import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { SnapshotHistoryStore } from '../../application/vocabulary/snapshot-history.store';
import { SourceMappingStore } from '../../application/vocabulary/source-mapping.store';
import { VocabularySyncService } from '../../application/vocabulary/vocabulary-sync.service';
import { parseTextList } from '../../domain/vocabulary/text-list-parser';
import type { TextListVocabularySource } from '../../domain/vocabulary/vocabulary-source';
import { textListPreviewLabel } from './text-list-preview';

/** Focused editor shared by the add-source flow and existing source rows. */
@Component({
  selector: 'mn-text-list-source',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
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
          rows="7"
          [value]="content()"
          (input)="setContent($event)"
          placeholder="猫&#10;食べる&#10;おはようございます"
          data-testid="text-source-content"
        ></textarea>
      </label>
      <p class="preview" aria-live="polite">
        {{ previewLabel() }}
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
            saving() ? 'Updating vocabulary…' : source() === null ? 'Add source' : 'Save changes'
          }}
        </button>
        <button type="button" class="mn-button" [disabled]="saving()" (click)="cancelled.emit()">
          Cancel
        </button>
      </div>
    </form>
  `,
  styles: `
    .editor {
      display: grid;
      gap: var(--space-2);
      padding: var(--space-3);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-card);
      background: var(--surface-panel);
    }

    textarea {
      min-height: 9rem;
      resize: vertical;
      font-family: inherit;
    }

    p {
      margin: 0;
    }

    .preview {
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    .error {
      color: var(--status-danger);
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }
  `,
})
export class TextListSourceComponent {
  readonly source = input<TextListVocabularySource | null>(null);
  readonly saved = output<void>();
  readonly cancelled = output<void>();

  private readonly store = inject(SourceMappingStore);
  private readonly sync = inject(VocabularySyncService);
  private readonly history = inject(SnapshotHistoryStore);

  protected readonly label = signal('');
  protected readonly content = signal('');
  protected readonly saving = signal(false);
  protected readonly editorError = signal<string | null>(null);
  protected readonly preview = computed(() => parseTextList(this.content()));
  protected readonly previewLabel = computed(() => textListPreviewLabel(this.preview()));

  constructor() {
    effect(() => {
      const source = this.source();
      this.label.set(source?.label ?? '');
      this.content.set(source?.content ?? '');
      this.editorError.set(null);
    });
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
    const existing = this.source();
    const stored =
      existing === null
        ? await this.store.addTextList(label, parsed.normalizedContent)
        : await this.store.updateTextList(existing.id, {
            label,
            content: parsed.normalizedContent,
          });
    if (stored === null) {
      this.editorError.set('The source could not be saved. Your current vocabulary is unchanged.');
      this.saving.set(false);
      return;
    }
    const applied = await this.sync.applyTextSource(stored);
    if (!applied.ok) {
      this.editorError.set(`${applied.error.message} Your current vocabulary is unchanged.`);
      this.saving.set(false);
      return;
    }
    await this.history.load();
    this.saving.set(false);
    this.saved.emit();
  }
}
