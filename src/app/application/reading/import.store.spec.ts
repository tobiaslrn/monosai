import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { languageError } from '../../domain/language/language-error';
import { MAXIMUM_IMPORT_CHARACTERS } from '../../domain/reading/import-text';
import type { ImportedReading } from '../../domain/reading/reading';
import type { ImportedReadingDraft } from '../../domain/reading/reading-repository';
import { ok, type Result } from '../../domain/shared/result';
import { storageError, type StorageError } from '../../domain/storage/storage-error';
import { FakeLanguageRuntime, sequentialIdGenerator } from '../../../testing/reading-fakes';
import { AppBusyRegistry } from '../shared/app-busy.registry';
import { ID_GENERATOR } from '../shared/repository-tokens';
import { ImportStore } from './import.store';
import { TextImportService, type SaveImportRequest } from './text-import.service';

class FakeTextImportService {
  readonly runtime = new FakeLanguageRuntime();
  languageReady = true;
  saved: SaveImportRequest | null = null;
  saveFailure: StorageError | null = null;

  ensureLanguageReady(): Promise<Result<void, ReturnType<typeof languageError>>> {
    return Promise.resolve(
      this.languageReady
        ? ok(undefined)
        : { ok: false, error: languageError('assets-unavailable', 'not ready') },
    );
  }

  async segment(text: string) {
    const { buildImportDraft } = await import('../../domain/reading/import-structure');
    const segments = await this.runtime.segment(text);
    if (!segments.ok) {
      return segments;
    }
    let counter = 0;
    return ok(
      buildImportDraft(text, segments.value, () => {
        counter += 1;
        return `s-${String(counter)}`;
      }),
    );
  }

  async analyzeSentences(
    sentences: readonly { readonly id: string; readonly text: string }[],
    onProgress?: (progress: { completed: number; total: number }) => void,
  ) {
    onProgress?.({ completed: 0, total: sentences.length });
    const analyzed = await this.runtime.analyzeSentences(sentences.map((s) => s.text));
    if (!analyzed.ok) {
      return analyzed;
    }
    const map = new Map(sentences.map((s, index) => [s.id, analyzed.value[index].tokens]));
    onProgress?.({ completed: sentences.length, total: sentences.length });
    return ok(map);
  }

  save(request: SaveImportRequest): Promise<Result<ImportedReading, StorageError>> {
    this.saved = request;
    if (this.saveFailure !== null) {
      return Promise.resolve({ ok: false, error: this.saveFailure });
    }
    const draft = { reading: { id: 'reading-1' } } as unknown as ImportedReadingDraft;
    return Promise.resolve(ok(draft.reading));
  }
}

describe('ImportStore', () => {
  let store: ImportStore;
  let imports: FakeTextImportService;

  beforeEach(() => {
    imports = new FakeTextImportService();
    TestBed.configureTestingModule({
      providers: [
        ImportStore,
        { provide: TextImportService, useValue: imports },
        { provide: ID_GENERATOR, useValue: sequentialIdGenerator('new') },
      ],
    });
    store = TestBed.inject(ImportStore);
  });

  describe('busy registry', () => {
    it('registers as busy once there is unsaved pasted text, and clears when cleared', () => {
      const busy = TestBed.inject(AppBusyRegistry);
      TestBed.tick();
      expect(busy.isBusy()).toBe(false);

      store.setPastedText('こんにちは');
      TestBed.tick();
      expect(busy.isBusy()).toBe(true);

      store.setPastedText('');
      TestBed.tick();
      expect(busy.isBusy()).toBe(false);
    });
  });

  describe('input validation', () => {
    it('blocks continuing with empty input and says why', async () => {
      store.setPastedText('   ');
      expect(store.canContinue()).toBe(false);

      await store.continueToReview();
      expect(store.rejection()?.code).toBe('empty');
      expect(store.step()).toBe('input');
    });

    it('blocks continuing with text over the limit', async () => {
      store.setPastedText('あ'.repeat(MAXIMUM_IMPORT_CHARACTERS + 1));
      await store.continueToReview();

      expect(store.rejection()?.code).toBe('too-long');
      expect(store.step()).toBe('input');
    });

    it('normalizes line endings as the text is entered', () => {
      store.setPastedText('猫。\r\n犬。');
      expect(store.rawText()).toBe('猫。\n犬。');
    });

    it('derives the title from the first non-empty line', () => {
      store.setPastedText('\n第一章\n猫が寝た。');
      expect(store.derivedTitle()).toBe('第一章');
      expect(store.resolvedTitle()).toBe('第一章');
    });
  });

  describe('file import', () => {
    it('takes its title from the file name and keeps the text', () => {
      store.loadFile({ name: '第一章.txt', bytes: new TextEncoder().encode('猫が寝た。').buffer });

      expect(store.rawText()).toBe('猫が寝た。');
      expect(store.derivedTitle()).toBe('第一章');
      expect(store.importSource()).toBe('text-file');
    });

    it('reports a non-UTF-8 file without discarding a pasted draft', () => {
      store.setPastedText('もとの文章。');
      store.loadFile({ name: 'bad.txt', bytes: new Uint8Array([0x94, 0x4c]).buffer });

      expect(store.rejection()?.code).toBe('not-utf8');
      expect(store.rawText()).toBe('もとの文章。');
    });

    it('reports a file with no visible text distinctly', () => {
      store.loadFile({ name: 'blank.txt', bytes: new TextEncoder().encode('   \n ').buffer });
      expect(store.rejection()?.code).toBe('no-visible-text');
    });
  });

  describe('review', () => {
    beforeEach(async () => {
      store.setPastedText('猫が寝た。犬も寝た。\n\n鳥は飛んだ。');
      await store.continueToReview();
    });

    it('segments into reviewable paragraphs and analyses every sentence', () => {
      expect(store.step()).toBe('review');
      expect(store.draft()?.paragraphs).toHaveLength(2);
      expect(store.sentenceCount()).toBe(3);
      expect(store.hasPendingAnalysis()).toBe(false);
      expect(store.canSave()).toBe(true);
    });

    it('splits a sentence and re-analyses only the halves', async () => {
      const first = store.draft()!.paragraphs[0].sentences[0];
      await store.split(first.id, 3);

      expect(store.draft()!.paragraphs[0].sentences.map((s) => s.text)).toEqual([
        '猫が寝',
        'た。',
        '犬も寝た。',
      ]);
      expect(store.hasPendingAnalysis()).toBe(false);
      expect(store.announcement()).toBe('Sentence split into two.');
    });

    it('reports an impossible split without changing the draft', async () => {
      const before = store.draft();
      const first = before!.paragraphs[0].sentences[0];
      await store.split(first.id, 0);

      expect(store.editFailure()?.code).toBe('split-offset-out-of-range');
      expect(store.draft()).toBe(before);
    });

    it('merges two sentences back together', async () => {
      const second = store.draft()!.paragraphs[0].sentences[1];
      await store.merge(second.id, 'previous');

      expect(store.draft()!.paragraphs[0].sentences.map((s) => s.text)).toEqual([
        '猫が寝た。犬も寝た。',
      ]);
      expect(store.announcement()).toBe('Sentences merged.');
    });

    it('refuses to merge across a paragraph boundary', async () => {
      const onlySentence = store.draft()!.paragraphs[1].sentences[0];
      await store.merge(onlySentence.id, 'previous');

      expect(store.editFailure()?.code).toBe('no-previous-sentence');
      expect(store.draft()!.paragraphs).toHaveLength(2);
    });

    it('returns to raw input without losing anything', () => {
      store.backToInput();
      expect(store.step()).toBe('input');
      expect(store.rawText()).toBe('猫が寝た。犬も寝た。\n\n鳥は飛んだ。');
      expect(store.draft()).not.toBeNull();
    });
  });

  describe('language readiness', () => {
    it('reports an explicit failure instead of hanging when assets are missing', async () => {
      imports.languageReady = false;
      store.setPastedText('猫が寝た。');
      await store.continueToReview();

      expect(store.step()).toBe('input');
      expect(store.languageFailure()?.code).toBe('assets-unavailable');
      expect(store.busy()).toEqual({ kind: 'idle' });
    });

    it('can retry once assets become available', async () => {
      imports.languageReady = false;
      store.setPastedText('猫が寝た。');
      await store.continueToReview();

      imports.languageReady = true;
      await store.continueToReview();

      expect(store.step()).toBe('review');
      expect(store.languageFailure()).toBeNull();
    });

    it('refuses to segment when the analyser fails, and stays on the input step', async () => {
      store.setPastedText('猫が寝た。');
      imports.runtime.failWith = languageError('analysis-failed', 'nope');
      await store.continueToReview();

      expect(store.step()).toBe('input');
      expect(store.languageFailure()?.code).toBe('analysis-failed');
    });

    it('blocks saving while an edit is left unanalysed by a failure', async () => {
      store.setPastedText('猫が寝た。犬も寝た。');
      await store.continueToReview();
      expect(store.canSave()).toBe(true);

      // The re-analysis after a split is what fails here, so the reviewed
      // boundaries survive but the reading cannot be saved without tokens.
      imports.runtime.failWith = languageError('analysis-failed', 'nope');
      const first = store.draft()!.paragraphs[0].sentences[0];
      await store.split(first.id, 3);

      expect(store.languageFailure()?.code).toBe('analysis-failed');
      expect(store.hasPendingAnalysis()).toBe(true);
      expect(store.canSave()).toBe(false);
      expect(await store.save()).toBeNull();
    });
  });

  describe('saving', () => {
    beforeEach(async () => {
      store.setPastedText('猫が寝た。');
      store.setTitle('わたしの章');
      await store.continueToReview();
    });

    it('saves the reviewed draft with the resolved title', async () => {
      const id = await store.save();

      expect(id).toBe('reading-1');
      expect(imports.saved?.title).toBe('わたしの章');
      expect(imports.saved?.sourceText).toBe('猫が寝た。');
      expect(imports.saved?.importSource).toBe('paste');
    });

    it('clears the unsaved-work guard after a successful save', async () => {
      expect(store.isDirty()).toBe(true);
      await store.save();
      expect(store.isDirty()).toBe(false);
    });

    it('keeps the draft and the guard when saving fails', async () => {
      imports.saveFailure = storageError('quota', 'no room');
      const id = await store.save();

      expect(id).toBeNull();
      expect(store.storageFailure()?.code).toBe('quota');
      expect(store.draft()).not.toBeNull();
      expect(store.isDirty()).toBe(true);
    });

    it('is dirty only while there is text that has not been saved', () => {
      store.reset();
      expect(store.isDirty()).toBe(false);
    });
  });
});
