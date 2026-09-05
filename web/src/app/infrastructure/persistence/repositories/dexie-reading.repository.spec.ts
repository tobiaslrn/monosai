import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixedClock } from '../../../domain/shared/clock';
import { readingId, sentenceId, snapshotId } from '../../../domain/shared/ids';
import type { MonosaiDatabase } from '../monosai-db';
import { createTestDatabase, destroyTestDatabase } from '../../../../testing/test-database';
import {
  generatedStoryDraftFixture,
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

    it('finds every imported reading with the same source hash', async () => {
      const first = importedReadingFixture();
      const second = importedReadingFixture({ seed: 42 });
      await repository.saveImportedReading(first);
      await repository.saveImportedReading({
        ...second,
        reading: { ...second.reading, sourceTextHash: first.reading.sourceTextHash },
      });

      const matches = await repository.listImportedBySourceHash(first.reading.sourceTextHash);

      expect(matches.ok && matches.value.map((reading) => reading.id)).toEqual([
        first.reading.id,
        second.reading.id,
      ]);
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

  describe('saving a generated story', () => {
    const storySnapshotId = snapshotId(uuid(9_500));

    it('writes the text, validation, and provenance in one transaction', async () => {
      const draft = generatedStoryDraftFixture(storySnapshotId);

      const saved = await repository.saveGeneratedStory(draft);

      expect(saved.ok).toBe(true);
      expect(await db.readings.count()).toBe(1);
      expect(await db.paragraphs.count()).toBe(1);
      expect(await db.sentences.count()).toBe(draft.sentences.length);
      expect(await db.tokenAnalyses.count()).toBe(draft.tokenAnalyses.length);
      expect(await db.frozenValidations.count()).toBe(draft.frozenValidations.length);
      expect(await db.generationProvenance.count()).toBe(1);
    });

    it('reads back as a generated reading with its provenance pointer intact', async () => {
      const draft = generatedStoryDraftFixture(storySnapshotId);
      await repository.saveGeneratedStory(draft);

      const stored = await repository.getReading(draft.reading.id);

      expect(stored.ok).toBe(true);
      if (!stored.ok || stored.value?.kind !== 'generated') {
        throw new Error('expected a stored generated story');
      }
      expect(stored.value.generationProvenanceId).toBe(draft.provenance.id);
      expect(stored.value.snapshotId).toBe(storySnapshotId);
    });

    it('saves a draft whose repairs left a word unknown, marker and all', async () => {
      const draft = generatedStoryDraftFixture(storySnapshotId, {
        firstTokenValidation: { category: 'unknown', reason: 'unresolved-after-repair' },
      });

      const saved = await repository.saveGeneratedStory(draft);

      expect(saved.ok).toBe(true);
      expect(await db.readings.count()).toBe(1);
      const stored = await db.frozenValidations.get(draft.frozenValidations[0].sentenceId);
      expect(stored?.tokenStatuses[0].validation).toEqual({
        category: 'unknown',
        reason: 'unresolved-after-repair',
      });
    });

    it('refuses a draft carrying the imported-only not-in-snapshot category', async () => {
      const draft = generatedStoryDraftFixture(storySnapshotId, {
        firstTokenValidation: { category: 'not-in-snapshot' },
      });

      const saved = await repository.saveGeneratedStory(draft);

      expect(saved.ok).toBe(false);
      expect(await db.readings.count()).toBe(0);
    });

    it('accepts a policy exception, which is a validated status', async () => {
      const draft = generatedStoryDraftFixture(storySnapshotId, {
        firstTokenValidation: {
          category: 'policy-exception',
          exceptionId: 'candidate-1',
          explanationEn: 'The policy allows place names the learner mentioned.',
        },
      });

      const saved = await repository.saveGeneratedStory(draft);

      expect(saved.ok).toBe(true);
    });

    it('refuses provenance that describes a different run', async () => {
      const draft = generatedStoryDraftFixture(storySnapshotId, {
        provenance: { modelId: '' },
      });

      const saved = await repository.saveGeneratedStory(draft);

      expect(saved.ok).toBe(false);
      expect(await db.readings.count()).toBe(0);
    });

    it('refuses a story whose sentences are not all validated', async () => {
      const draft = generatedStoryDraftFixture(storySnapshotId);

      const saved = await repository.saveGeneratedStory({
        ...draft,
        frozenValidations: draft.frozenValidations.slice(0, 1),
      });

      expect(saved.ok).toBe(false);
      expect(await db.readings.count()).toBe(0);
    });

    it('refuses a duplicate story identity and keeps the first save intact', async () => {
      const draft = generatedStoryDraftFixture(storySnapshotId);
      await repository.saveGeneratedStory(draft);

      const second = await repository.saveGeneratedStory(draft);

      expect(second.ok).toBe(false);
      expect(await db.readings.count()).toBe(1);
      expect(await db.generationProvenance.count()).toBe(1);
    });

    it('leaves no owned rows behind when the story is deleted', async () => {
      const draft = generatedStoryDraftFixture(storySnapshotId);
      await repository.saveGeneratedStory(draft);

      await repository.deleteReading(draft.reading.id);

      expect(await db.readings.count()).toBe(0);
      expect(await db.frozenValidations.count()).toBe(0);
      expect(await db.generationProvenance.count()).toBe(0);
      expect(await db.translations.where('readingId').equals(draft.reading.id).count()).toBe(0);
      expect(await db.grammarAnalyses.where('readingId').equals(draft.reading.id).count()).toBe(0);
    });

    it('saves a story that carries no aid rows at all', async () => {
      const draft = generatedStoryDraftFixture(storySnapshotId);

      const saved = await repository.saveGeneratedStory(draft);

      // Generation writes Japanese and stops; the preparation lane stores every
      // aid afterwards, so the save that used to carry them now carries none.
      expect(saved.ok).toBe(true);
      expect(await db.readings.count()).toBe(1);
      expect(await db.translations.count()).toBe(0);
      expect(await db.grammarAnalyses.count()).toBe(0);
      const stored = await db.readings.get(draft.reading.id);
      expect(stored?.translationSummary).toEqual({
        total: draft.sentences.length,
        completed: 0,
        failed: 0,
      });
    });

    it('refuses a translation summary claiming completions no row supports, writing nothing', async () => {
      const base = generatedStoryDraftFixture(storySnapshotId);
      const draft = {
        ...base,
        reading: {
          ...base.reading,
          translationSummary: { total: base.sentences.length, completed: 2, failed: 0 },
        },
      };

      const saved = await repository.saveGeneratedStory(draft);

      expect(saved.ok).toBe(false);
      if (saved.ok) {
        throw new Error('expected a conflict');
      }
      expect(saved.error.code).toBe('conflict');
      expect(await db.readings.count()).toBe(0);
      expect(await db.translations.count()).toBe(0);
    });

    it('refuses a translation summary whose counts do not add up, writing nothing', async () => {
      const base = generatedStoryDraftFixture(storySnapshotId);
      const draft = {
        ...base,
        reading: {
          ...base.reading,
          translationSummary: { total: 1, completed: 0, failed: 2 },
        },
      };

      const saved = await repository.saveGeneratedStory(draft);

      expect(saved.ok).toBe(false);
      expect(await db.readings.count()).toBe(0);
    });

    it('refuses a grammar summary claiming a review that has not happened, writing nothing', async () => {
      const base = generatedStoryDraftFixture(storySnapshotId);
      const draft = {
        ...base,
        reading: {
          ...base.reading,
          grammarSummary: { state: 'complete' as const, concernCount: 0 },
        },
      };

      const saved = await repository.saveGeneratedStory(draft);

      expect(saved.ok).toBe(false);
      if (saved.ok) {
        throw new Error('expected a conflict');
      }
      expect(saved.error.code).toBe('conflict');
      expect(await db.readings.count()).toBe(0);
      expect(await db.grammarAnalyses.count()).toBe(0);
    });

    it('records the strictness and the targets the generation ran under', async () => {
      const draft = generatedStoryDraftFixture(storySnapshotId, {
        provenance: { vocabularyStrictness: 'strict', preparationTargets: ['english', 'audio'] },
      });

      await repository.saveGeneratedStory(draft);

      const stored = await db.generationProvenance.get(draft.provenance.id);
      expect(stored?.vocabularyStrictness).toBe('strict');
      expect(stored?.preparationTargets).toEqual(['english', 'audio']);
    });

    it('reads back a provenance row written before either was recorded', async () => {
      const draft = generatedStoryDraftFixture(storySnapshotId);
      await repository.saveGeneratedStory(draft);
      await db.generationProvenance.update(draft.provenance.id, {
        vocabularyStrictness: undefined,
        preparationTargets: undefined,
      });

      const stored = await repository.getReading(draft.reading.id);

      expect(stored.ok).toBe(true);
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

    it('returns lightweight sentence references in source order', async () => {
      const draft = importedReadingFixture();
      await repository.saveImportedReading(draft);

      const refs = await repository.listSentenceRefs(draft.reading.id);

      expect(refs.ok && refs.value.map((ref) => ref.positionInReading)).toEqual([0, 1, 2]);
      expect(refs.ok && refs.value.map((ref) => ref.id)).toEqual(
        draft.sentences.map((sentence) => sentence.id),
      );
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

      vi.spyOn(db.tokenAnalyses, 'where').mockImplementationOnce(() => {
        throw failure;
      });
      expect((await repository.loadTokenAnalyses([draft.sentences[0].id])).ok).toBe(false);
    });
  });

  describe('declaring preparation targets', () => {
    it('records the targets and touches the reading, keeping the rest intact', async () => {
      const draft = importedReadingFixture();
      await repository.saveImportedReading(draft);

      const saved = await repository.setPreparationTargets(draft.reading.id, ['english', 'audio']);

      expect(saved.ok).toBe(true);
      if (!saved.ok) {
        return;
      }
      expect(saved.value.preparationTargets).toEqual(['english', 'audio']);
      expect(saved.value.updatedAt).toBe(1_700_100_000_000);
      expect(saved.value.title).toBe(draft.reading.title);
      expect(saved.value.sentenceCount).toBe(draft.reading.sentenceCount);
    });

    it('keeps one entry per layer when a caller repeats one', async () => {
      const draft = importedReadingFixture();
      await repository.saveImportedReading(draft);

      const saved = await repository.setPreparationTargets(draft.reading.id, [
        'english',
        'english',
      ]);

      expect(saved.ok && saved.value.preparationTargets).toEqual(['english']);
    });

    it('reports a reading that no longer exists rather than creating one', async () => {
      const missing = await repository.setPreparationTargets(
        readingId('3f6d2c1a-9b4e-4a7d-8f21-0c5e7a9b1d33'),
        ['english'],
      );

      expect(missing.ok).toBe(false);
      expect(!missing.ok && missing.error.code).toBe('not-found');
      expect(await db.readings.count()).toBe(0);
    });
  });

  describe('renaming a reading', () => {
    it('writes the new title and leaves the stored text alone', async () => {
      const draft = importedReadingFixture();
      await repository.saveImportedReading(draft);

      const renamed = await repository.renameReading(draft.reading.id, '猫の一日');

      expect(renamed.ok).toBe(true);
      if (!renamed.ok) {
        return;
      }
      expect(renamed.value.title).toBe('猫の一日');
      expect(renamed.value.updatedAt).toBe(1_700_100_000_000);
      expect(renamed.value.characterCount).toBe(draft.reading.characterCount);
      expect(await db.sentences.count()).toBe(draft.sentences.length);
      const stored = await db.readings.get(draft.reading.id);
      expect(stored?.title).toBe('猫の一日');
    });

    it('reports a reading that no longer exists rather than creating one', async () => {
      const missing = await repository.renameReading(
        readingId('3f6d2c1a-9b4e-4a7d-8f21-0c5e7a9b1d33'),
        '猫の一日',
      );

      expect(missing.ok).toBe(false);
      expect(!missing.ok && missing.error.code).toBe('not-found');
      expect(await db.readings.count()).toBe(0);
    });
  });
});
