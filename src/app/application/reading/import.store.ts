import { Injectable, computed, inject, signal } from '@angular/core';
import type { LanguageError } from '../../domain/language/language-error';
import {
  applyAnalysis,
  mergeSentence,
  splitSentence,
  totalSentenceCount,
  unanalyzedSentences,
  type DraftEditFailure,
  type ImportDraft,
} from '../../domain/reading/import-draft';
import {
  decodeUtf8,
  normalizeImportedText,
  countCharacters,
  validateImportText,
  type ImportRejection,
} from '../../domain/reading/import-text';
import {
  resolveTitle,
  titleFromFileName,
  titleFromPastedText,
} from '../../domain/reading/import-title';
import type { ImportSource } from '../../domain/reading/reading';
import type { ReadingId } from '../../domain/shared/ids';
import type { StorageError } from '../../domain/storage/storage-error';
import { ID_GENERATOR } from '../shared/repository-tokens';
import { TextImportService, type AnalysisProgress } from './text-import.service';

export type ImportStep = 'input' | 'review';

/** What the workflow is waiting on, if anything. */
export type ImportBusy =
  | { readonly kind: 'idle' }
  | { readonly kind: 'preparing-language' }
  | { readonly kind: 'segmenting' }
  | { readonly kind: 'analyzing'; readonly completed: number; readonly total: number }
  | { readonly kind: 'saving' };

export interface ImportFileInput {
  readonly name: string;
  readonly bytes: ArrayBuffer;
}

const IDLE: ImportBusy = { kind: 'idle' };

/**
 * State of the Add text workflow.
 *
 * The store owns one import at a time: raw text, the reviewed structure, and
 * whichever failure is currently relevant. Language and persistence work is
 * delegated to `TextImportService`, so nothing here knows about workers or
 * storage.
 */
@Injectable()
export class ImportStore {
  private readonly imports = inject(TextImportService);
  private readonly ids = inject(ID_GENERATOR);

  private readonly stepSignal = signal<ImportStep>('input');
  private readonly busySignal = signal<ImportBusy>(IDLE);
  private readonly rawTextSignal = signal('');
  private readonly sourceSignal = signal<ImportSource>('paste');
  private readonly fileNameSignal = signal<string | null>(null);
  private readonly titleInputSignal = signal('');
  private readonly draftSignal = signal<ImportDraft | null>(null);
  private readonly rejectionSignal = signal<ImportRejection | null>(null);
  private readonly languageFailureSignal = signal<LanguageError | null>(null);
  private readonly storageFailureSignal = signal<StorageError | null>(null);
  private readonly editFailureSignal = signal<DraftEditFailure | null>(null);
  private readonly announcementSignal = signal('');
  private readonly savedIdSignal = signal<ReadingId | null>(null);

  readonly step = this.stepSignal.asReadonly();
  readonly busy = this.busySignal.asReadonly();
  readonly rawText = this.rawTextSignal.asReadonly();
  readonly importSource = this.sourceSignal.asReadonly();
  readonly fileName = this.fileNameSignal.asReadonly();
  readonly titleInput = this.titleInputSignal.asReadonly();
  readonly draft = this.draftSignal.asReadonly();
  readonly rejection = this.rejectionSignal.asReadonly();
  readonly languageFailure = this.languageFailureSignal.asReadonly();
  readonly storageFailure = this.storageFailureSignal.asReadonly();
  readonly editFailure = this.editFailureSignal.asReadonly();
  readonly announcement = this.announcementSignal.asReadonly();
  readonly savedReadingId = this.savedIdSignal.asReadonly();

  readonly characterCount = computed(() => countCharacters(this.rawTextSignal()));
  readonly isBusy = computed(() => this.busySignal().kind !== 'idle');

  /** What the title field is prefilled with when the learner has not typed one. */
  readonly derivedTitle = computed(() => {
    const fileName = this.fileNameSignal();
    return fileName === null
      ? titleFromPastedText(this.rawTextSignal())
      : titleFromFileName(fileName);
  });

  readonly resolvedTitle = computed(() =>
    resolveTitle(this.titleInputSignal(), this.derivedTitle()),
  );

  readonly sentenceCount = computed(() => {
    const draft = this.draftSignal();
    return draft === null ? 0 : totalSentenceCount(draft);
  });

  /** Save is blocked while any reviewed boundary is still awaiting tokens. */
  readonly hasPendingAnalysis = computed(() => {
    const draft = this.draftSignal();
    return draft !== null && unanalyzedSentences(draft).length > 0;
  });

  readonly canContinue = computed(
    () => validateImportText(this.rawTextSignal()).ok && !this.isBusy(),
  );

  readonly canSave = computed(
    () => this.draftSignal() !== null && !this.isBusy() && !this.hasPendingAnalysis(),
  );

  /**
   * Whether leaving would lose work. A successful save clears it, so the guard
   * never challenges a learner who is simply moving on to the reader.
   */
  readonly isDirty = computed(
    () => this.savedIdSignal() === null && this.rawTextSignal().trim().length > 0,
  );

  setPastedText(text: string): void {
    this.rawTextSignal.set(normalizeImportedText(text));
    this.sourceSignal.set('paste');
    this.fileNameSignal.set(null);
    this.rejectionSignal.set(null);
  }

  setTitle(title: string): void {
    this.titleInputSignal.set(title);
  }

  /**
   * Decodes a chosen file as strict UTF-8.
   *
   * A rejected file leaves any pasted draft untouched: the specification
   * requires a file error not to destroy text the learner already had.
   */
  loadFile(file: ImportFileInput): void {
    const decoded = decodeUtf8(file.bytes);
    if (!decoded.ok) {
      this.rejectionSignal.set(decoded.error);
      return;
    }
    const validated = validateImportText(decoded.value, 'no-visible-text');
    if (!validated.ok) {
      this.rejectionSignal.set(validated.error);
      return;
    }

    this.rawTextSignal.set(validated.value.text);
    this.sourceSignal.set('text-file');
    this.fileNameSignal.set(file.name);
    this.titleInputSignal.set('');
    this.rejectionSignal.set(null);
  }

  /** Validates, waits for the language bundle if needed, then segments. */
  async continueToReview(): Promise<void> {
    const validated = validateImportText(this.rawTextSignal());
    if (!validated.ok) {
      this.rejectionSignal.set(validated.error);
      return;
    }
    this.rejectionSignal.set(null);
    this.languageFailureSignal.set(null);

    this.busySignal.set({ kind: 'preparing-language' });
    const ready = await this.imports.ensureLanguageReady();
    if (!ready.ok) {
      this.languageFailureSignal.set(ready.error);
      this.busySignal.set(IDLE);
      return;
    }

    this.busySignal.set({ kind: 'segmenting' });
    const segmented = await this.imports.segment(validated.value.text);
    if (!segmented.ok) {
      this.languageFailureSignal.set(segmented.error);
      this.busySignal.set(IDLE);
      return;
    }

    this.draftSignal.set(segmented.value);
    this.stepSignal.set('review');
    this.announce(`Review ${String(totalSentenceCount(segmented.value))} sentences before saving.`);
    await this.analyzePending();
  }

  /** Re-runs analysis for sentences left unanalyzed by an earlier failure. */
  async retryAnalysis(): Promise<void> {
    this.languageFailureSignal.set(null);
    const ready = await this.imports.ensureLanguageReady();
    if (!ready.ok) {
      this.languageFailureSignal.set(ready.error);
      return;
    }
    await this.analyzePending();
  }

  /** Returns to raw input without losing the text or the reviewed structure. */
  backToInput(): void {
    this.stepSignal.set('input');
    this.editFailureSignal.set(null);
  }

  async split(sentenceId: string, offsetUtf16: number): Promise<void> {
    await this.edit((draft) =>
      splitSentence(draft, sentenceId, offsetUtf16, () => this.ids.nextId()),
    );
  }

  async merge(sentenceId: string, direction: 'previous' | 'next'): Promise<void> {
    await this.edit((draft) => mergeSentence(draft, sentenceId, direction));
  }

  async save(): Promise<ReadingId | null> {
    const draft = this.draftSignal();
    if (draft === null || this.hasPendingAnalysis()) {
      return null;
    }

    this.storageFailureSignal.set(null);
    this.busySignal.set({ kind: 'saving' });
    const fileName = this.fileNameSignal();

    const saved = await this.imports.save({
      draft,
      title: this.resolvedTitle(),
      sourceText: this.rawTextSignal(),
      importSource: this.sourceSignal(),
      ...(fileName === null ? {} : { sourceFileName: fileName }),
    });
    this.busySignal.set(IDLE);

    if (!saved.ok) {
      this.storageFailureSignal.set(saved.error);
      this.announce('The reading could not be saved. Nothing was changed.');
      return null;
    }

    this.savedIdSignal.set(saved.value.id);
    this.announce('Reading saved.');
    return saved.value.id;
  }

  reset(): void {
    this.stepSignal.set('input');
    this.busySignal.set(IDLE);
    this.rawTextSignal.set('');
    this.sourceSignal.set('paste');
    this.fileNameSignal.set(null);
    this.titleInputSignal.set('');
    this.draftSignal.set(null);
    this.rejectionSignal.set(null);
    this.languageFailureSignal.set(null);
    this.storageFailureSignal.set(null);
    this.editFailureSignal.set(null);
    this.savedIdSignal.set(null);
    this.announcementSignal.set('');
  }

  private async edit(
    apply: (draft: ImportDraft) => ReturnType<typeof splitSentence>,
  ): Promise<void> {
    const draft = this.draftSignal();
    if (draft === null) {
      return;
    }
    const result = apply(draft);
    if (!result.ok) {
      this.editFailureSignal.set(result.failure);
      this.announce(result.failure.message);
      return;
    }

    this.editFailureSignal.set(null);
    this.draftSignal.set(result.draft);
    this.announce(result.announcement);
    await this.analyzePending();
  }

  /** Tokenizes whichever sentences currently have no analysis. */
  private async analyzePending(): Promise<void> {
    const draft = this.draftSignal();
    if (draft === null) {
      return;
    }
    const pending = unanalyzedSentences(draft);
    if (pending.length === 0) {
      return;
    }

    const onProgress = (progress: AnalysisProgress): void => {
      this.busySignal.set({ kind: 'analyzing', ...progress });
    };

    const analyzed = await this.imports.analyzeSentences(
      pending.map((sentence) => ({ id: sentence.id, text: sentence.text })),
      onProgress,
    );
    this.busySignal.set(IDLE);

    if (!analyzed.ok) {
      this.languageFailureSignal.set(analyzed.error);
      return;
    }
    this.languageFailureSignal.set(null);
    // Re-read the draft: an edit may have landed while analysis was running.
    const current = this.draftSignal();
    if (current !== null) {
      this.draftSignal.set(applyAnalysis(current, analyzed.value));
    }
  }

  private announce(message: string): void {
    this.announcementSignal.set(message);
  }
}
