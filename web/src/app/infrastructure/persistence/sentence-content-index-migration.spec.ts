import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { fixedClock } from '../../domain/shared/clock';
import { importedReadingFixture } from '../../../testing/persistence-fixtures';
import { CURRENT_SCHEMA_VERSION, SCHEMA_VERSIONS } from './migrations';
import { MonosaiDatabase } from './monosai-db';
import { DexieReadingRepository } from './repositories/dexie-reading.repository';

const V18_STORES = SCHEMA_VERSIONS.find((version) => version.version === 18)!.stores;

/** Two readings with the same first sentence, as version 18 stored them. */
const first = importedReadingFixture({ seed: 1 });
const second = importedReadingFixture({
  seed: 2,
  paragraphTexts: [['別の文です。', 'ねこがすきです。']],
});

/** An analysis version 18 wrote for the second reading, after the first had written it. */
const SHARED_ANALYSIS = {
  v: 1,
  id: '33333333-3333-4333-8333-333333333333',
  cacheKey: 'grammar-shared',
  sentenceId: second.sentences[1]!.id,
  readingId: second.reading.id,
  sourceContentHash: second.sentences[1]!.contentHash,
  profileHash: 'profile-hash-1',
  modelId: 'vendor/text-model',
  promptVersion: 'grammar-v1',
  findings: [],
  createdAt: 1_700_000_000_000,
};

async function withUpgradedDatabase(assert: (db: MonosaiDatabase) => Promise<void>): Promise<void> {
  const name = `sentence-content-${crypto.randomUUID()}`;
  const old = new Dexie(name);
  old.version(18).stores(V18_STORES);
  const db = new MonosaiDatabase(name);
  try {
    await old.open();
    await old
      .table('sentences')
      .bulkAdd(
        [...first.sentences, ...second.sentences].map((sentence) => ({ v: 1, ...sentence })),
      );
    await old.table('grammarAnalyses').add(SHARED_ANALYSIS);
    old.close();

    await db.open();
    await assert(db);
  } finally {
    old.close();
    db.close();
    await Dexie.delete(name);
  }
}

describe('schema v19 sentence content index', () => {
  it('indexes every stored sentence by its content and rewrites nothing', async () => {
    await withUpgradedDatabase(async (db) => {
      expect(db.verno).toBe(CURRENT_SCHEMA_VERSION);
      const shared = first.sentences[0]!.contentHash;

      const twins = await db.sentences.where('contentHash').equals(shared).primaryKeys();

      expect(twins.sort()).toEqual([first.sentences[0]!.id, second.sentences[1]!.id].sort());
      expect(await db.sentences.count()).toBe(first.sentences.length + second.sentences.length);
      expect(await db.grammarAnalyses.get('grammar-shared')).toEqual(SHARED_ANALYSIS);
    });
  });

  it('keeps an analysis an earlier version shared when the reading it was last written for is deleted', async () => {
    await withUpgradedDatabase(async (db) => {
      const readings = new DexieReadingRepository(db, fixedClock(1_700_000_000_000));

      const deleted = await readings.deleteReading(second.reading.id);

      expect(deleted.ok).toBe(true);
      expect(await db.grammarAnalyses.get('grammar-shared')).toEqual({
        ...SHARED_ANALYSIS,
        sentenceId: first.sentences[0]!.id,
        readingId: first.reading.id,
      });
    });
  });
});
