import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { languageError } from '../../domain/language/language-error';
import { MAXIMUM_IMPORT_CHARACTERS } from '../../domain/reading/import-text';
import type { ImportedReading } from '../../domain/reading/reading';
import type { ImportedReadingDraft } from '../../domain/reading/reading-repository';
import { ok, type Result } from '../../domain/shared/result';
import { storageError, type StorageError } from '../../domain/storage/storage-error';
import { FakeLanguageRuntime } from '../../../testing/reading-fakes';
import { AppBusyRegistry } from '../shared/app-busy.registry';
import { ImportStore } from './import.store';
import { TextImportService, type SaveImportRequest } from './text-import.service';

class FakeTextImportService {
  readonly runtime = new FakeLanguageRuntime();
  languageReady = true;
  analysisFailure: ReturnType<typeof languageError> | null = null;
  saved: SaveImportRequest | null = null;
  saveFailure: StorageError | null = null;
  duplicates: ImportedReading[] = [];

  findDuplicates(): Promise<Result<readonly ImportedReading[], StorageError>> {
    return Promise.resolve(ok(this.duplicates));
  }

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
    if (this.analysisFailure !== null) {
      return { ok: false as const, error: this.analysisFailure };
    }
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
      providers: [ImportStore, { provide: TextImportService, useValue: imports }],
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
    it('blocks saving with empty input and says why', async () => {
      store.setPastedText('   ');
      expect(store.canSave()).toBe(false);

      await store.save();

      expect(store.rejection()?.code).toBe('empty');
      expect(imports.saved).toBeNull();
    });

    it('blocks saving with text over the limit', async () => {
      store.setPastedText('あ'.repeat(MAXIMUM_IMPORT_CHARACTERS + 1));
      await store.save();

      expect(store.rejection()?.code).toBe('too-long');
      expect(imports.saved).toBeNull();
    });

    it('normalizes line endings as the text is entered', () => {
      store.setPastedText('猫。\r\n犬。');
      expect(store.rawText()).toBe('猫。\n犬。');
    });

    it('derives the title from the first meaningful sentence', () => {
      store.setPastedText('\n第一章\n猫が寝た。');
      expect(store.derivedTitle()).toBe('第一章');
      expect(store.resolvedTitle()).toBe('第一章');
    });

    it('normalizes format and control characters before validation', () => {
      store.setPastedText('\u200b猫\u0000犬。');
      expect(store.rawText()).toBe('猫犬。');
      expect(store.derivedTitle()).toBe('猫犬。');
    });

    it('warns about text without a Japanese-script signal', () => {
      store.setPastedText('Hello world.');
      expect(store.advisories().map((advisory) => advisory.code)).toContain('little-japanese');
    });
  });

  describe('direct import', () => {
    it('requires an explicit second action and gives a duplicate a distinct title', async () => {
      imports.duplicates = [{ id: 'existing', title: '猫が寝た。' } as unknown as ImportedReading];
      store.setPastedText('猫が寝た。');

      expect(await store.save()).toBeNull();
      expect(store.duplicates()).toHaveLength(1);
      expect(imports.saved).toBeNull();

      expect(await store.save()).toBe('reading-1');
      expect(imports.saved?.title).toBe('猫が寝た。 (copy 2)');
    });

    it('segments, analyzes, saves, and preserves blank-line paragraphs in one action', async () => {
      store.setPastedText('猫が寝た。犬も寝た。\n\n鳥は飛んだ。');
      store.setTitle('わたしの章');

      const id = await store.save();

      expect(id).toBe('reading-1');
      expect(store.hasPendingAnalysis()).toBe(false);
      expect(imports.saved?.title).toBe('わたしの章');
      expect(imports.saved?.sourceText).toBe('猫が寝た。犬も寝た。\n\n鳥は飛んだ。');
      expect(imports.saved?.draft.paragraphs.map((paragraph) => paragraph.sourceText)).toEqual([
        '猫が寝た。犬も寝た。\n\n',
        '鳥は飛んだ。',
      ]);
    });

    it('clears the unsaved-work guard after a successful save', async () => {
      store.setPastedText('猫が寝た。');
      expect(store.isDirty()).toBe(true);

      await store.save();

      expect(store.isDirty()).toBe(false);
    });

    it('keeps the draft and the guard when saving fails', async () => {
      imports.saveFailure = storageError('quota', 'no room');
      store.setPastedText('猫が寝た。');

      const id = await store.save();

      expect(id).toBeNull();
      expect(store.storageFailure()?.code).toBe('quota');
      expect(store.draft()).not.toBeNull();
      expect(store.isDirty()).toBe(true);
    });

    it('does not save when sentence analysis fails', async () => {
      imports.analysisFailure = languageError('analysis-failed', 'nope');
      store.setPastedText('猫が寝た。');

      const id = await store.save();

      expect(id).toBeNull();
      expect(store.languageFailure()?.code).toBe('analysis-failed');
      expect(store.hasPendingAnalysis()).toBe(true);
      expect(imports.saved).toBeNull();
    });
  });

  describe('language readiness', () => {
    it('reports an explicit failure instead of hanging when assets are missing', async () => {
      imports.languageReady = false;
      store.setPastedText('猫が寝た。');

      await store.save();

      expect(store.languageFailure()?.code).toBe('assets-unavailable');
      expect(store.busy()).toEqual({ kind: 'idle' });
      expect(imports.saved).toBeNull();
    });

    it('can retry the same action once assets become available', async () => {
      imports.languageReady = false;
      store.setPastedText('猫が寝た。');
      await store.save();

      imports.languageReady = true;
      const id = await store.save();

      expect(id).toBe('reading-1');
      expect(store.languageFailure()).toBeNull();
    });

    it('stays unsaved when segmentation fails', async () => {
      store.setPastedText('猫が寝た。');
      imports.runtime.failWith = languageError('analysis-failed', 'nope');

      await store.save();

      expect(store.languageFailure()?.code).toBe('analysis-failed');
      expect(imports.saved).toBeNull();
    });
  });

  it('is dirty only while there is text that has not been saved', () => {
    store.reset();
    expect(store.isDirty()).toBe(false);
  });
});
