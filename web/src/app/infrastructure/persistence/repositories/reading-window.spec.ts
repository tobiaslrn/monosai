import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fixedClock } from '../../../domain/shared/clock';
import { OWNED_READING_STORES } from '../../../domain/reading/deletion-plan';
import { unwrap } from '../../../domain/shared/result';
import type { MonosaiDatabase } from '../monosai-db';
import { createTestDatabase, destroyTestDatabase } from '../../../../testing/test-database';
import { importedReadingFixture } from '../../../../testing/persistence-fixtures';
import { DexieReadingRepository } from './dexie-reading.repository';

/**
 * Reader-facing repository behaviour: bounded window loading, position lookup,
 * and the cascade that must leave no owned row behind.
 */
describe('reading window and cascade', () => {
  let db: MonosaiDatabase;
  let repository: DexieReadingRepository;

  /** Twelve paragraphs of two sentences, which is more than one reader window. */
  const paragraphTexts = Array.from({ length: 12 }, (_, index) => [
    `第${String(index + 1)}段落の一文目です。`,
    `第${String(index + 1)}段落の二文目です。`,
  ]);

  beforeEach(async () => {
    db = await createTestDatabase();
    repository = new DexieReadingRepository(db, fixedClock(1_700_000_000_000));
  });

  afterEach(async () => {
    await destroyTestDatabase(db);
  });

  async function seed() {
    const draft = importedReadingFixture({ paragraphTexts });
    unwrap(await repository.saveImportedReading(draft));
    return draft;
  }

  it('saves the whole reading graph atomically', async () => {
    const draft = await seed();

    expect(await db.readings.count()).toBe(1);
    expect(await db.paragraphs.count()).toBe(12);
    expect(await db.sentences.count()).toBe(24);
    expect(await db.tokenAnalyses.count()).toBe(24);

    const stored = unwrap(await repository.getReading(draft.reading.id));
    expect(stored?.sentenceCount).toBe(24);
  });

  it('leaves nothing behind when a save is rejected', async () => {
    const draft = await seed();

    // Saving the same reading twice must not append a second copy of its text.
    const second = await repository.saveImportedReading(draft);
    expect(second.ok).toBe(false);
    expect(await db.paragraphs.count()).toBe(12);
    expect(await db.sentences.count()).toBe(24);
  });

  it('loads only the requested paragraph window', async () => {
    const draft = await seed();

    const window = unwrap(
      await repository.loadGraph(draft.reading.id, {
        firstParagraphPosition: 4,
        paragraphCount: 3,
      }),
    );

    expect(window.paragraphs.map((paragraph) => paragraph.position)).toEqual([4, 5, 6]);
    expect(window.sentences).toHaveLength(6);
    // Every returned sentence belongs to a returned paragraph: no stragglers.
    const paragraphIds = new Set(window.paragraphs.map((paragraph) => paragraph.id));
    for (const sentence of window.sentences) {
      expect(paragraphIds.has(sentence.paragraphId)).toBe(true);
    }
  });

  it('clamps a window that runs past the end of the reading', async () => {
    const draft = await seed();

    const window = unwrap(
      await repository.loadGraph(draft.reading.id, {
        firstParagraphPosition: 10,
        paragraphCount: 8,
      }),
    );

    expect(window.paragraphs.map((paragraph) => paragraph.position)).toEqual([10, 11]);
  });

  it('counts paragraphs without loading their text', async () => {
    const draft = await seed();
    expect(unwrap(await repository.countParagraphs(draft.reading.id))).toBe(12);
  });

  it('deletes a reading with zero owned orphan rows', async () => {
    const draft = await seed();
    const other = importedReadingFixture({ seed: 7, paragraphTexts: [['別の話です。']] });
    unwrap(await repository.saveImportedReading(other));

    unwrap(await repository.deleteReading(draft.reading.id));

    // Every store the reading owns holds nothing belonging to it any more.
    for (const store of OWNED_READING_STORES) {
      const rows = await db.table(store).toArray();
      const orphans = rows.filter(
        (row: { readingId?: string }) => row.readingId === draft.reading.id,
      );
      expect(orphans, `orphans left in ${store}`).toEqual([]);
    }

    expect(await db.readings.count()).toBe(1);
    // The unrelated reading is untouched.
    expect(unwrap(await repository.getReading(other.reading.id))).not.toBeNull();
  });

  it('pages the library newest first without loading child data', async () => {
    for (let index = 0; index < 5; index += 1) {
      unwrap(
        await repository.saveImportedReading(
          importedReadingFixture({
            seed: 20 + index,
            title: `Reading ${String(index)}`,
            createdAt: 1_700_000_000_000 + index * 1_000,
            paragraphTexts: [['短い話です。']],
          }),
        ),
      );
    }

    const first = unwrap(await repository.listLibraryPage({ filter: 'all', limit: 3 }));
    expect(first.items.map((reading) => reading.title)).toEqual([
      'Reading 4',
      'Reading 3',
      'Reading 2',
    ]);
    expect(first.hasMore).toBe(true);

    const second = unwrap(
      await repository.listLibraryPage({
        filter: 'all',
        limit: 3,
        createdBefore: first.items[2].createdAt,
      }),
    );
    expect(second.items.map((reading) => reading.title)).toEqual(['Reading 1', 'Reading 0']);
    expect(second.hasMore).toBe(false);
  });
});
