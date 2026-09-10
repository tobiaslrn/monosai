import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSIONS } from './migrations';
import { MonosaiDatabase } from './monosai-db';

const V14_STORES = SCHEMA_VERSIONS.find((version) => version.version === 14)!.stores;

describe('schema v15 first-review precision', () => {
  it('preserves exact legacy timestamps when their precision marker is absent', async () => {
    const name = `first-review-precision-${crypto.randomUUID()}`;
    const old = new Dexie(name);
    const db = new MonosaiDatabase(name);
    const item = {
      v: 1,
      id: '33333333-3333-4333-8333-333333333333',
      snapshotId: '11111111-1111-4111-8111-111111111111',
      visibleExpression: '猫',
      canonicalExpression: '猫',
      expressionHash: 'hash-cat',
      firstReviewedAt: 1_700_000_000_000,
      analyzedSequence: [{ surface: '猫', readingHiragana: 'ねこ' }],
    };
    const cache = {
      v: 1,
      sourceId: '22222222-2222-4222-8222-222222222222',
      refreshedAt: 1_700_000_000_000,
      entries: [{ rawValue: '猫', firstReviewedAt: 1_700_000_000_000 }],
      warnings: [],
      practice: {
        recentAnswers: 'unsupported',
        recentDifficulty: 'unsupported',
        learningState: 'unsupported',
        fsrsDifficulty: 'unsupported',
        windowBasis: 'anki-study-days',
        observedAt: 1_700_000_000_000,
      },
    };

    try {
      old.version(14).stores(V14_STORES);
      await old.open();
      await old.table('vocabularyItems').put(item);
      await old.table('vocabularySourceCaches').put(cache);
      old.close();

      await db.open();

      expect(db.verno).toBe(15);
      expect(await db.vocabularyItems.get(item.id)).toEqual(item);
      expect(await db.vocabularySourceCaches.get(cache.sourceId)).toEqual(cache);
    } finally {
      old.close();
      db.close();
      await Dexie.delete(name);
    }
  });
});
