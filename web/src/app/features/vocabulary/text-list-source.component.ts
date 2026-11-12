import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { SnapshotHistoryStore } from '../../application/vocabulary/snapshot-history.store';
import { SourceMappingStore } from '../../application/vocabulary/source-mapping.store';
import { VocabularySyncService } from '../../application/vocabulary/vocabulary-sync.service';
import { formatCountOf } from '../../domain/shared/locale';
import { parseTextList } from '../../domain/vocabulary/text-list-parser';
import type { TextListVocabularySource } from '../../domain/vocabulary/vocabulary-source';
import { textListPreviewLabel } from './text-list-preview';
import { ButtonDirective } from '../../shared-ui/button/button';
import { CardComponent } from '../../shared-ui/card/card.component';
import { FieldComponent } from '../../shared-ui/field/field.component';
import { ClusterComponent } from '../../shared-ui/layout/layout';
import { NoticeComponent } from '../../shared-ui/notice/notice.component';

/** Focused editor shared by the Add words sheet and a pasted list's own page. */
@Component({
  selector: 'mn-text-list-source',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonDirective, CardComponent, ClusterComponent, FieldComponent, NoticeComponent],
  template: `
    <form (submit)="save($event)" data-testid="text-source-editor">
      <mn-card>
        <mn-field label="List name">
          <input
            type="text"
            maxlength="80"
            [value]="label()"
            (input)="setLabel($event)"
            placeholder="Genki vocabulary"
          />
        </mn-field>
        <mn-field label="Words">
          <textarea
            rows="7"
            [value]="content()"
            (input)="setContent($event)"
            placeholder="猫&#10;食べる&#10;おはようございます"
            data-testid="text-source-content"
          ></textarea>
        </mn-field>
        <p class="mn-hint" aria-live="polite">
          {{ previewLabel() }}
        </p>
        @if (!canSave()) {
          <p id="mn-text-source-requirements" class="mn-hint">
            {{ requirements() }}
          </p>
        }
        @if (editorError(); as error) {
          <mn-notice tone="error" role="alert"
            ><p>{{ error }}</p></mn-notice
          >
        }
        @if (preview().nonJapaneseLines > 0) {
          <p class="mn-hint" role="status">
            {{ formatCountOf(preview().nonJapaneseLines, 'line') }}
            {{ preview().nonJapaneseLines === 1 ? 'does' : 'do' }} not appear to contain Japanese.
            Check that these are the words you intended; they can still be added.
          </p>
        }
        <mn-cluster>
          <button
            mnButton="primary"
            type="submit"
            [disabled]="saving() || preview().entries.length === 0 || label().trim().length === 0"
            [attr.aria-describedby]="!canSave() ? 'mn-text-source-requirements' : null"
            data-testid="save-text-source"
          >
            {{
              saving() ? 'Updating vocabulary…' : source() === null ? 'Add source' : 'Save changes'
            }}
          </button>
          <button mnButton type="button" [disabled]="saving()" (click)="cancelled.emit()">
            Cancel
          </button>
        </mn-cluster>
      </mn-card>
    </form>
  `,
})
export class TextListSourceComponent {
  readonly source = input<TextListVocabularySource | null>(null);
  readonly saved = output<void>();
  readonly cancelled = output<void>();

  private readonly store = inject(SourceMappingStore);
  private readonly sync = inject(VocabularySyncService);
  private readonly history = inject(SnapshotHistoryStore);

  // Opening another source (or none) starts the editor over from that source.
  protected readonly label = linkedSignal(() => this.source()?.label ?? '');
  protected readonly content = linkedSignal(() => this.source()?.content ?? '');
  protected readonly editorError = linkedSignal({
    source: this.source,
    computation: (): string | null => null,
  });
  protected readonly saving = signal(false);
  protected readonly preview = computed(() => parseTextList(this.content()));
  protected readonly canSave = computed(
    () => this.label().trim().length > 0 && this.preview().entries.length > 0,
  );
  protected readonly requirements = computed(() => {
    const needsName = this.label().trim().length === 0;
    const needsWord = this.preview().entries.length === 0;
    if (needsName && needsWord) return 'Needs a name and a word';
    if (needsName) return 'Needs a name';
    return 'Needs a word';
  });
  protected readonly previewLabel = computed(() => textListPreviewLabel(this.preview()));
  protected readonly formatCountOf = formatCountOf;

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
      this.editorError.set('Could not save. Your words are unchanged.');
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
