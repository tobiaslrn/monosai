import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixedClock } from '../../../domain/shared/clock';
import { readingId, sentenceId } from '../../../domain/shared/ids';
import type { MonosaiDatabase } from '../monosai-db';
import { createTestDatabase, destroyTestDatabase } from '../../../../testing/test-database';
import {
  generatedStoryFixture,
  importedReadingFixture,
  snapshotFixture,
  uuid,
} from '../../../../testing/persistence-fixtures';
import { DexieReadingRepository } from './dexie-reading.repository';
import { ROW_VERSION } from '../schemas/common.schema';

describe('DexieReadingRepository', () => {
  let db: MonosaiDatabase;
  let repository: DexieReadingRepository;

  beforeEach(async () => {
    db = await createTestDatabase();
    repository = new DexieReadingRepository(db, fixedClock(1_700_100_000_000));
  });

  afterEach(async () => {
    await destroyTestDatabase(db);
  });

  describe('saving an imported reading', () => {
    it('writes the reading, text, and token analyses atomically', async () => {
      const draft = importedReadingFixture();

      const saved = await repository.saveImportedReading(draft);

      expect(saved.ok).toBe(true);
      expect(await db.readings.count()).toBe(1);
      expect(await db.paragraphs.count()).toBe(draft.paragraphs.length);
      expect(await db.sentences.count()).toBe(draft.sentences.length);
      expect(await db.tokenAnalyses.count()).toBe(draft.tokenAnalyses.length);
    });

    it('refuses a duplicate reading identity and keeps the first save intact', async () => {
      const draft = importedReadingFixture();
      await repository.saveImportedReading(draft);

      const second = await repository.saveImportedReading({
        ...draft,
        reading: { ...draft.reading, title: 'Rewritten' },
      });

      expect(second.ok).toBe(false);
      if (second.ok) {
        throw new Error('expected a conflict');
      }
      expect(second.error.code).toBe('conflict');

      const stored = await repository.getReading(draft.reading.id);
      expect(stored.ok && stored.value?.title).toBe(draft.reading.title);
    });

    it('rejects duplicate sentence positions before writing anything', async () => {
      const draft = importedReadingFixture();
      const broken = {
        ...draft,
        sentences: draft.sentences.map((sentence) => ({ ...sentence, positionInReading: 0 })),
      };

      const saved = await repository.saveImportedReading(broken);

      expect(saved.ok).toBe(false);
      expect(await db.readings.count()).toBe(0);
      expect(await db.sentences.count()).toBe(0);
    });

    it('rejects a sentence whose paragraph is not part of the same save', async () => {
      const draft = importedReadingFixture();

      const saved = await repository.saveImportedReading({
        reading: { ...draft.reading, sentenceCount: 1 },
        paragraphs: [],
        sentences: [draft.sentences[0]],
        tokenAnalyses: [draft.tokenAnalyses[0]],
      });

      expect(saved.ok).toBe(false);
      if (saved.ok) {
        return;
      }
      expect(saved.error.code).toBe('conflict');
      expect(await db.readings.count()).toBe(0);
    });

    it('rejects a token analysis whose sentence is not part of the same save', async () => {
      const draft = importedReadingFixture();
      const other = importedReadingFixture({ seed: 42 });

      const saved = await repository.saveImportedReading({
        ...draft,
        tokenAnalyses: [...draft.tokenAnalyses, other.tokenAnalyses[0]],
      });

      expect(saved.ok).toBe(false);
      expect(await db.tokenAnalyses.count()).toBe(0);
    });

    it('rejects a sentence count that disagrees with the sentences', async () => {
      const draft = importedReadingFixture();

      const saved = await repository.saveImportedReading({
        ...draft,
        reading: { ...draft.reading, sentenceCount: draft.sentences.length + 1 },
      });

      expect(saved.ok).toBe(false);
      expect(await db.readings.count()).toBe(0);
    });
  });

  describe('reading the graph', () => {
    it('returns paragraphs and sentences in source order', async () => {
      const draft = importedReadingFixture();
      await repository.saveImportedReading(draft);

      const graph = await repository.loadGraph(draft.reading.id);

      expect(graph.ok).toBe(true);
      if (!graph.ok) {
        return;
      }
      expect(graph.value.paragraphs.map((paragraph) => paragraph.position)).toEqual([0, 1]);
      expect(graph.value.sentences.map((sentence) => sentence.positionInReading)).toEqual([
        0, 1, 2,
      ]);
      expect(graph.value.sentences[0].japaneseText).toBe('ねこがすきです。');
    });

    it('loads only the requested paragraph window', async () => {
      const draft = importedReadingFixture({
        paragraphTexts: [['一。'], ['二。'], ['三。'], ['四。']],
      });
      await repository.saveImportedReading(draft);

      const graph = await repository.loadGraph(draft.reading.id, {
        firstParagraphPosition: 1,
        paragraphCount: 2,
      });

      expect(graph.ok).toBe(true);
      if (!graph.ok) {
        return;
      }
      expect(graph.value.paragraphs.map((paragraph) => paragraph.sourceText)).toEqual([
        '二。',
        '三。',
      ]);
      expect(graph.value.sentences).toHaveLength(2);
    });

    it('loads token analyses for the requested sentences only', async () => {
      const draft = importedReadingFixture();
      await repository.saveImportedReading(draft);

      const analyses = await repository.loadTokenAnalyses([draft.sentences[0].id]);

      expect(analyses.ok).toBe(true);
      if (!analyses.ok) {
        return;
      }
      expect(analyses.value).toHaveLength(1);
      expect(analyses.value[0].sentenceId).toBe(draft.sentences[0].id);
    });

    it('counts paragraphs without loading their text', async () => {
      const draft = importedReadingFixture({
        paragraphTexts: [['一。'], ['二。'], ['三。']],
      });
      await repository.saveImportedReading(draft);

      const count = await repository.countParagraphs(draft.reading.id);

      expect(count.ok && count.value).toBe(3);
    });

    it('locates the sentence and paragraph at a position through two indexed lookups', async () => {
      const draft = importedReadingFixture();
      await repository.saveImportedReading(draft);

      const located = await repository.locateSentence(draft.reading.id, 1);

      expect(located.ok).toBe(true);
      if (!located.ok) {
        return;
      }
      expect(located.value).toEqual({
        sentenceId: draft.sentences[1].id,
        paragraphId: draft.sentences[1].paragraphId,
        paragraphPosition: draft.paragraphs[0].position,
        positionInReading: 1,
      });
    });

    it('returns null when no sentence occupies that position', async () => {
      const draft = importedReadingFixture();
      await repository.saveImportedReading(draft);

      const located = await repository.locateSentence(draft.reading.id, 99);

      expect(located.ok && located.value).toBeNull();
    });

    it('returns null when the sentence exists but its paragraph does not', async () => {
      const draft = importedReadingFixture();
      await repository.saveImportedReading(draft);
      await db.paragraphs.delete(draft.sentences[0].paragraphId);

      const located = await repository.locateSentence(draft.reading.id, 0);

      expect(located.ok && located.value).toBeNull();
    });
  });

  describe('library queries', () => {
    it('returns readings newest first and paginates without loading children', async () => {
      for (let index = 0; index < 3; index += 1) {
        const draft = importedReadingFixture({
          seed: index + 1,
          title: `Reading ${index}`,
          createdAt: 1_700_000_000_000 + index * 1000,
        });
        await repository.saveImportedReading(draft);
      }

      const first = await repository.listLibraryPage({ filter: 'all', limit: 2 });

      expect(first.ok).toBe(true);
      if (!first.ok) {
        return;
      }
      expect(first.value.items.map((reading) => reading.title)).toEqual(['Reading 2', 'Reading 1']);
      expect(first.value.hasMore).toBe(true);

      const second = await repository.listLibraryPage({
        filter: 'all',
        limit: 2,
        createdBefore: first.value.items[1].createdAt,
      });
      expect(second.ok && second.value.items.map((reading) => reading.title)).toEqual([
        'Reading 0',
      ]);
      expect(second.ok && second.value.hasMore).toBe(false);
    });

    it('filters by imported and generated source', async () => {
      const imported = importedReadingFixture({ seed: 5 });
      await repository.saveImportedReading(imported);

      const commit = snapshotFixture(6);
      const story = generatedStoryFixture(7, commit.snapshot.id);
      await db.readings.add({ ...story, v: ROW_VERSION });

      const generated = await repository.listLibraryPage({ filter: 'generated', limit: 10 });
      const importedPage = await repository.listLibraryPage({ filter: 'imported', limit: 10 });

      expect(generated.ok && generated.value.items.map((reading) => reading.kind)).toEqual([
        'generated',
      ]);
      expect(importedPage.ok && importedPage.value.items.map((reading) => reading.kind)).toEqual([
        'imported',
      ]);
      expect((await repository.countReadings('all')).ok).toBe(true);
      expect(await db.readings.count()).toBe(2);
    });

    it('reads a bounded number of rows and never touches audio or text tables', async () => {
      for (let index = 0; index < 30; index += 1) {
        await repository.saveImportedReading(
          importedReadingFixture({
            seed: index + 1,
            title: `Reading ${index}`,
            createdAt: 1_700_000_000_000 + index * 1000,
          }),
        );
      }

      const audioGet = vi.spyOn(db.audioAssets, 'get');
      const audioWhere = vi.spyOn(db.audioAssets, 'where');
      const paragraphsWhere = vi.spyOn(db.paragraphs, 'where');
      const sentencesWhere = vi.spyOn(db.sentences, 'where');
      const tokenAnalysesWhere = vi.spyOn(db.tokenAnalyses, 'where');

      const page = await repository.listLibraryPage({ filter: 'all', limit: 5 });

      expect(page.ok).toBe(true);
      if (page.ok) {
        // Bounded by the requested page size regardless of how many readings
        // exist: the library's first page never scales with total library size.
        expect(page.value.items.length).toBeLessThanOrEqual(5);
        expect(page.value.hasMore).toBe(true);
      }

      // The library summary lives entirely on the denormalized reading row, so
      // listing a page never reads audio bytes or any child text table.
      expect(audioGet).not.toHaveBeenCalled();
      expect(audioWhere).not.toHaveBeenCalled();
      expect(paragraphsWhere).not.toHaveBeenCalled();
      expect(sentencesWhere).not.toHaveBeenCalled();
      expect(tokenAnalysesWhere).not.toHaveBeenCalled();
    });
  });

  describe('progress and continue reading', () => {
    it('stores progress by paragraph and sentence identity', async () => {
      const draft = importedReadingFixture();
      await repository.saveImportedReading(draft);

      await repository.saveProgress({
        readingId: draft.reading.id,
        paragraphId: draft.paragraphs[0].id,
        sentenceId: draft.sentences[1].id,
        positionInReading: 1,
        lastOpenedAt: 1_700_100_000_000,
        updatedAt: 1_700_100_000_000,
      });

      const progress = await repository.getProgress(draft.reading.id);
      expect(progress.ok && progress.value?.sentenceId).toBe(draft.sentences[1].id);

      const continueTarget = await repository.resolveContinueReading();
      expect(continueTarget.ok && continueTarget.value?.readingId).toBe(draft.reading.id);
      expect(continueTarget.ok && continueTarget.value?.progress?.positionInReading).toBe(1);
    });

    it('points Continue reading at the most recently opened reading', async () => {
      const older = importedReadingFixture({ seed: 11, title: 'Older' });
      const newer = importedReadingFixture({ seed: 12, title: 'Newer' });
      await repository.saveImportedReading(older);
      await repository.saveImportedReading(newer);

      await repository.markOpened(older.reading.id, 1_700_100_000_000);
      await repository.markOpened(newer.reading.id, 1_700_100_500_000);

      const target = await repository.resolveContinueReading();
      expect(target.ok && target.value?.title).toBe('Newer');
    });

    it('returns no Continue reading target before anything is opened', async () => {
      const draft = importedReadingFixture();
      await repository.saveImportedReading(draft);

      const target = await repository.resolveContinueReading();
      expect(target.ok && target.value).toBeNull();
    });
  });

  describe('deletion', () => {
    it('removes every owned row and repairs Continue reading', async () => {
      const first = importedReadingFixture({ seed: 21, title: 'First' });
      const second = importedReadingFixture({ seed: 22, title: 'Second' });
      await repository.saveImportedReading(first);
      await repository.saveImportedReading(second);
      await repository.markOpened(first.reading.id, 1_700_100_000_000);
      await repository.markOpened(second.reading.id, 1_700_100_500_000);

      await db.translations.add({
        v: ROW_VERSION,
        id: uuid(9001),
        cacheKey: 'cache-key-1',
        sentenceId: second.sentences[0].id,
        readingId: second.reading.id,
        sourceContentHash: 'hash',
        textEn: 'The cat likes it.',
        modelId: 'test-model',
        promptVersion: 'v1',
        createdAt: 1_700_100_000_000,
      });

      const deleted = await repository.deleteReading(second.reading.id);
      expect(deleted.ok).toBe(true);

      expect(await db.readings.count()).toBe(1);
      expect(await db.paragraphs.where('readingId').equals(second.reading.id).count()).toBe(0);
      expect(await db.sentences.where('readingId').equals(second.reading.id).count()).toBe(0);
      expect(await db.tokenAnalyses.where('readingId').equals(second.reading.id).count()).toBe(0);
      expect(await db.translations.where('readingId').equals(second.reading.id).count()).toBe(0);
      expect(await db.readingProgress.get(second.reading.id)).toBeUndefined();

      const target = await repository.resolveContinueReading();
      expect(target.ok && target.value?.title).toBe('First');
    });

    it('leaves other readings and their children untouched', async () => {
      const kept = importedReadingFixture({ seed: 31 });
      const removed = importedReadingFixture({ seed: 32 });
      await repository.saveImportedReading(kept);
      await repository.saveImportedReading(removed);

      await repository.deleteReading(removed.reading.id);

      expect(await db.sentences.where('readingId').equals(kept.reading.id).count()).toBe(
        kept.sentences.length,
      );
    });

    it('reports success when the reading is already gone', async () => {
      const missing = await repository.deleteReading(readingId(uuid(999)));
      expect(missing.ok).toBe(true);
    });
  });

  describe('corrupt records', () => {
    it('reports a corrupt reading row instead of returning invalid data', async () => {
      const draft = importedReadingFixture();
      await repository.saveImportedReading(draft);
      await db.readings.update(draft.reading.id, { sentenceCount: -5 });

      const loaded = await repository.getReading(draft.reading.id);

      expect(loaded.ok).toBe(false);
      if (loaded.ok) {
        return;
      }
      expect(loaded.error.code).toBe('corrupt-record');
    });

    it('returns null for an unknown reading', async () => {
      const loaded = await repository.getReading(readingId(uuid(4242)));
      expect(loaded.ok && loaded.value).toBeNull();
    });

    it('returns no analyses for unknown sentences', async () => {
      const analyses = await repository.loadTokenAnalyses([sentenceId(uuid(4243))]);
      expect(analyses.ok && analyses.value).toEqual([]);
    });

    it('reports a corrupt paragraph row when loading the graph', async () => {
      const draft = importedReadingFixture();
      await repository.saveImportedReading(draft);
      await db.paragraphs.update(draft.paragraphs[0].id, { position: -1 });

      const graph = await repository.loadGraph(draft.reading.id);

      expect(graph.ok).toBe(false);
      expect(!graph.ok && graph.error.code).toBe('corrupt-record');
    });

    it('reports a corrupt sentence row when loading the graph', async () => {
      const draft = importedReadingFixture();
      await repository.saveImportedReading(draft);
      await db.sentences.update(draft.sentences[0].id, { positionInReading: -1 });

      const graph = await repository.loadGraph(draft.reading.id);

      expect(graph.ok).toBe(false);
      expect(!graph.ok && graph.error.code).toBe('corrupt-record');
    });

    it('reports a corrupt sentence row when locating a position', async () => {
      const draft = importedReadingFixture();
      await repository.saveImportedReading(draft);
      // `positionInParagraph`, unlike `positionInReading`, is not part of the
      // lookup index, so corrupting it does not stop the row from being found.
      await db.sentences.update(draft.sentences[0].id, { positionInParagraph: -1 });

      const located = await repository.locateSentence(draft.reading.id, 0);

      expect(located.ok).toBe(false);
      expect(!located.ok && located.error.code).toBe('corrupt-record');
    });

    it('reports a corrupt paragraph row when locating a position', async () => {
      const draft = importedReadingFixture();
      await repository.saveImportedReading(draft);
      await db.paragraphs.update(draft.sentences[0].paragraphId, { position: -1 });

      const located = await repository.locateSentence(draft.reading.id, 0);

      expect(located.ok).toBe(false);
      expect(!located.ok && located.error.code).toBe('corrupt-record');
    });

    it('reports a corrupt reading row when resolving Continue reading', async () => {
      const draft = importedReadingFixture();
      await repository.saveImportedReading(draft);
      await repository.markOpened(draft.reading.id, 1_700_000_500_000);
      await db.readings.update(draft.reading.id, { sentenceCount: -5 });

      const target = await repository.resolveContinueReading();

      expect(target.ok).toBe(false);
      expect(!target.ok && target.error.code).toBe('corrupt-record');
    });
  });

  describe('storage failures', () => {
    it('maps a rejected read into a typed storage error for every read method', async () => {
      const draft = importedReadingFixture();
      await repository.saveImportedReading(draft);
      const failure = new Error('disk unavailable');
      failure.name = 'UnknownError';

      vi.spyOn(db.readings, 'get').mockRejectedValueOnce(failure);
      expect((await repository.getReading(draft.reading.id)).ok).toBe(false);

      vi.spyOn(db.readings, 'where').mockImplementationOnce(() => {
        throw failure;
      });
      expect((await repository.listLibraryPage({ filter: 'all', limit: 5 })).ok).toBe(false);

      vi.spyOn(db.paragraphs, 'where').mockImplementationOnce(() => {
        throw failure;
      });
      expect((await repository.loadGraph(draft.reading.id)).ok).toBe(false);

      vi.spyOn(db.paragraphs, 'where').mockImplementationOnce(() => {
        throw failure;
      });
      expect((await repository.countParagraphs(draft.reading.id)).ok).toBe(false);

      vi.spyOn(db.sentences, 'where').mockImplementationOnce(() => {
        throw failure;
      });
      expect((await repository.locateSentence(draft.reading.id, 0)).ok).toBe(false);

      vi.spyOn(db.tokenAnalyses, 'where').mockImplementationOnce(() => {
        throw failure;
      });
      expect((await repository.loadTokenAnalyses([draft.sentences[0].id])).ok).toBe(false);

      vi.spyOn(db.readingProgress, 'get').mockRejectedValueOnce(failure);
      expect((await repository.getProgress(draft.reading.id)).ok).toBe(false);

      vi.spyOn(db.readings, 'where').mockImplementationOnce(() => {
        throw failure;
      });
      expect((await repository.resolveContinueReading()).ok).toBe(false);
    });

    it('propagates a failure to read progress while resolving Continue reading', async () => {
      const draft = importedReadingFixture();
      await repository.saveImportedReading(draft);
      await repository.markOpened(draft.reading.id, 1_700_000_500_000);
      const failure = new Error('disk unavailable');
      failure.name = 'UnknownError';
      vi.spyOn(db.readingProgress, 'get').mockRejectedValueOnce(failure);

      const target = await repository.resolveContinueReading();

      expect(target.ok).toBe(false);
    });
  });
});
