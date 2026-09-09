import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSIONS } from './migrations';
import { MonosaiDatabase } from './monosai-db';

const V11_STORES = SCHEMA_VERSIONS.find((version) => version.version === 11)!.stores;

/** A source cache exactly as version 11 wrote one, with no practice evidence. */
const LEGACY_CACHE = {
  v: 1,
  sourceId: '22222222-2222-4222-8222-222222222222',
  refreshedAt: 1_700_000_000_000,
  entries: [
    { rawValue: '猫', sourceRecordId: '1', reps: 3, intervalDays: 23 },
    { rawValue: '犬', sourceRecordId: '2', reps: 1 },
  ],
  warnings: ['Anki could not provide review dates.'],
};

describe('schema v12 practice evidence', () => {
  it('marks a cache read before the searches existed as unmeasured', async () => {
    // Backfilling would be the tempting mistake: these entries carry intervals
    // and repetition counts, and turning those into "answered recently" is
    // exactly the inference the searches replaced. A read that never asked the
    // question has no answer to record.
    const name = `practice-evidence-${crypto.randomUUID()}`;
    const old = new Dexie(name);
    old.version(11).stores(V11_STORES);
    const db = new MonosaiDatabase(name);
    try {
      await old.open();
      await old.table('vocabularySourceCaches').put(LEGACY_CACHE);
      old.close();

      await db.open();
      const upgraded = await db.vocabularySourceCaches.get(LEGACY_CACHE.sourceId);
      expect(upgraded?.practice).toEqual({
        recentAnswers: 'unsupported',
        recentDifficulty: 'unsupported',
        learningState: 'unsupported',
        fsrsDifficulty: 'unsupported',
        windowBasis: 'anki-study-days',
        observedAt: LEGACY_CACHE.refreshedAt,
      });
      // Nothing else about the saved read changes.
      expect(upgraded?.entries).toEqual(LEGACY_CACHE.entries);
      expect(upgraded?.warnings).toEqual(LEGACY_CACHE.warnings);
      expect(upgraded?.refreshedAt).toBe(LEGACY_CACHE.refreshedAt);
      expect(upgraded?.entries.every((entry) => entry.practice === undefined)).toBe(true);
    } finally {
      old.close();
      db.close();
      await Dexie.delete(name);
    }
  });

  it('leaves an upgraded database usable when the old cache had no refresh time', async () => {
    const name = `practice-evidence-${crypto.randomUUID()}`;
    const old = new Dexie(name);
    old.version(11).stores(V11_STORES);
    const db = new MonosaiDatabase(name);
    try {
      await old.open();
      await old
        .table('vocabularySourceCaches')
        .put({ ...LEGACY_CACHE, refreshedAt: undefined as unknown as number });
      old.close();

      await db.open();
      const upgraded = await db.vocabularySourceCaches.get(LEGACY_CACHE.sourceId);
      // A row the upgrade could not date still upgrades: the observation time is
      // only meaningful for a capture that established something, and this one
      // established nothing.
      expect(upgraded?.practice.observedAt).toBe(0);
      expect(upgraded?.practice.recentAnswers).toBe('unsupported');
    } finally {
      old.close();
      db.close();
      await Dexie.delete(name);
    }
  });
});
