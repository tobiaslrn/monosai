import { Injectable, computed, effect, inject, signal } from '@angular/core';
import type { LanguageError } from '../../domain/language/language-error';
import {
  applyAnalysis,
  unanalyzedSentences,
  type ImportDraft,
} from '../../domain/reading/import-draft';
import {
  normalizeImportedText,
  countCharacters,
  validateImportText,
  type ImportRejection,
} from '../../domain/reading/import-text';
import { resolveTitle, titleFromPastedText } from '../../domain/reading/import-title';
import type { ImportSource } from '../../domain/reading/reading';
import type { ReadingId } from '../../domain/shared/ids';
import type { StorageError } from '../../domain/storage/storage-error';
import { AppBusyRegistry } from '../shared/app-busy.registry';
import { TextImportService, type AnalysisProgress } from './text-import.service';

/** What the workflow is waiting on, if anything. */
export type ImportBusy =
  | { readonly kind: 'idle' }
  | { readonly kind: 'preparing-language' }
  | { readonly kind: 'segmenting' }
  | { readonly kind: 'analyzing'; readonly completed: number; readonly total: number }
  | { readonly kind: 'saving' };

const IDLE: ImportBusy = { kind: 'idle' };

/**
 * State of the Add text workflow.
 *
 * The store owns one import at a time: raw text, the transient structure, and
 * whichever failure is currently relevant. Language and persistence work is
 * delegated to `TextImportService`, so nothing here knows about workers or
 * storage.
 */
@Injectable()
export class ImportStore {
  private readonly imports = inject(TextImportService);
  private readonly busyRegistry = inject(AppBusyRegistry);

  private readonly busySignal = signal<ImportBusy>(IDLE);
  private readonly rawTextSignal = signal('');
  private readonly sourceSignal = signal<ImportSource>('paste');
  private readonly titleInputSignal = signal('');
  private readonly draftSignal = signal<ImportDraft | null>(null);
  private readonly rejectionSignal = signal<ImportRejection | null>(null);
  private readonly languageFailureSignal = signal<LanguageError | null>(null);
  private readonly storageFailureSignal = signal<StorageError | null>(null);
  private readonly announcementSignal = signal('');
  private readonly savedIdSignal = signal<ReadingId | null>(null);

  readonly busy = this.busySignal.asReadonly();
  readonly rawText = this.rawTextSignal.asReadonly();
  readonly importSource = this.sourceSignal.asReadonly();
  readonly titleInput = this.titleInputSignal.asReadonly();
  readonly draft = this.draftSignal.asReadonly();
  readonly rejection = this.rejectionSignal.asReadonly();
  readonly languageFailure = this.languageFailureSignal.asReadonly();
  readonly storageFailure = this.storageFailureSignal.asReadonly();
  readonly announcement = this.announcementSignal.asReadonly();
  readonly savedReadingId = this.savedIdSignal.asReadonly();

  readonly characterCount = computed(() => countCharacters(this.rawTextSignal()));
  readonly isBusy = computed(() => this.busySignal().kind !== 'idle');

  /** What the title field is prefilled with when the learner has not typed one. */
  readonly derivedTitle = computed(() => {
    return titleFromPastedText(this.rawTextSignal());
  });

  readonly resolvedTitle = computed(() =>
    resolveTitle(this.titleInputSignal(), this.derivedTitle()),
  );

  /** Save is blocked while any segmented sentence is still awaiting tokens. */
  readonly hasPendingAnalysis = computed(() => {
    const draft = this.draftSignal();
    return draft !== null && unanalyzedSentences(draft).length > 0;
  });

  readonly canSave = computed(() => validateImportText(this.rawTextSignal()).ok && !this.isBusy());

  /**
   * Whether leaving would lose work. A successful save clears it, so the guard
   * never challenges a learner who is simply moving on to the reader.
   */
  readonly isDirty = computed(
    () => this.savedIdSignal() === null && this.rawTextSignal().trim().length > 0,
  );

  constructor() {
    effect((onCleanup) => {
      this.busyRegistry.setBusy(
        'import-draft',
        this.isDirty() ? 'an import draft is unsaved' : null,
      );
      onCleanup(() => {
        this.busyRegistry.setBusy('import-draft', null);
      });
    });
  }

  setPastedText(text: string): void {
    this.rawTextSignal.set(normalizeImportedText(text));
    this.sourceSignal.set('paste');
    this.rejectionSignal.set(null);
  }

  setTitle(title: string): void {
    this.titleInputSignal.set(title);
  }

  /** Validates, analyzes, and saves the pasted text as one reading. */
  async save(): Promise<ReadingId | null> {
    if (this.isBusy()) {
      return null;
    }

    const validated = validateImportText(this.rawTextSignal());
    if (!validated.ok) {
      this.rejectionSignal.set(validated.error);
      return null;
    }
    this.rejectionSignal.set(null);
    this.languageFailureSignal.set(null);
    this.storageFailureSignal.set(null);

    this.busySignal.set({ kind: 'preparing-language' });
    const ready = await this.imports.ensureLanguageReady();
    if (!ready.ok) {
      this.languageFailureSignal.set(ready.error);
      this.busySignal.set(IDLE);
      return null;
    }

    this.busySignal.set({ kind: 'segmenting' });
    const segmented = await this.imports.segment(validated.value.text);
    if (!segmented.ok) {
      this.languageFailureSignal.set(segmented.error);
      this.busySignal.set(IDLE);
      return null;
    }

    this.draftSignal.set(segmented.value);
    await this.analyzePending();

    if (this.hasPendingAnalysis()) {
      return null;
    }

    return this.persistDraft();
  }

  private async persistDraft(): Promise<ReadingId | null> {
    const draft = this.draftSignal();
    if (draft === null || this.hasPendingAnalysis()) {
      return null;
    }

    this.storageFailureSignal.set(null);
    this.busySignal.set({ kind: 'saving' });
    const saved = await this.imports.save({
      draft,
      title: this.resolvedTitle(),
      sourceText: this.rawTextSignal(),
      importSource: this.sourceSignal(),
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
    this.busySignal.set(IDLE);
    this.rawTextSignal.set('');
    this.sourceSignal.set('paste');
    this.titleInputSignal.set('');
    this.draftSignal.set(null);
    this.rejectionSignal.set(null);
    this.languageFailureSignal.set(null);
    this.storageFailureSignal.set(null);
    this.savedIdSignal.set(null);
    this.announcementSignal.set('');
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
    // Re-read the draft in case a newer import attempt landed while analysis
    // was running.
    const current = this.draftSignal();
    if (current !== null) {
      this.draftSignal.set(applyAnalysis(current, analyzed.value));
    }
  }

  private announce(message: string): void {
    this.announcementSignal.set(message);
  }
}
