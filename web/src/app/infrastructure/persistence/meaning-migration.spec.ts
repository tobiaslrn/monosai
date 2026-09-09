import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSIONS } from './migrations';
import { MonosaiDatabase } from './monosai-db';

const V13_STORES = SCHEMA_VERSIONS.find((version) => version.version === 13)!.stores;
const SOURCE_ID = '22222222-2222-4222-8222-222222222222';
const SNAPSHOT_ID = '11111111-1111-4111-8111-111111111111';
const ITEM_ID = '33333333-3333-4333-8333-333333333333';

const SNAPSHOT = {
  v: 1,
  id: SNAPSHOT_ID,
  revision: 'revision-1',
  createdAt: 1_700_000_000_000,
  status: 'complete',
  uniqueEntryCount: 1,
  sourceIds: [SOURCE_ID],
  sourceKinds: ['anki-connect'],
  analyzerVersion: 'analyzer-1',
  normalizationVersion: 'normalization-1',
  stats: {
    sourcesQueried: 1,
    entriesRead: 1,
    nonEmptyValues: 1,
    rejectedEmptyValues: 0,
    duplicateOccurrences: 0,
    uniqueExpressions: 1,
    sourceWarnings: [],
  },
};

const SOURCE = {
  v: 1,
  id: SOURCE_ID,
  kind: 'anki-connect',
  providerKind: 'desktop-connect',
  label: 'Anki · Core Japanese · Expression',
  enabled: true,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  lastSyncedAt: 1_700_000_000_000,
  deckName: 'Core Japanese',
  deckScope: 'deck-only',
  noteTypeName: 'Basic',
  expressionFieldName: 'Expression',
  automaticSync: true,
};

const CACHE = {
  v: 1,
  sourceId: SOURCE_ID,
  refreshedAt: 1_700_000_000_000,
  entries: [{ rawValue: '猫', sourceRecordId: '10', reps: 2 }],
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

const ITEM = {
  v: 1,
  id: ITEM_ID,
  snapshotId: SNAPSHOT_ID,
  visibleExpression: '猫',
  canonicalExpression: '猫',
  expressionHash: 'hash-cat',
  reps: 2,
  analyzedSequence: [{ surface: '猫', readingHiragana: 'ねこ' }],
};

const PROVENANCE = {
  v: 1,
  vocabularyItemId: ITEM_ID,
  sourceId: SOURCE_ID,
  sourceKind: 'anki-connect',
  sourceLabel: SOURCE.label,
  deckName: SOURCE.deckName,
  noteTypeName: SOURCE.noteTypeName,
  fieldName: SOURCE.expressionFieldName,
  sourceRecordId: '10',
};

describe('schema v14 meaning fields', () => {
  it('preserves v13 rows and represents their missing meanings as absent', async () => {
    const name = `meaning-migration-${crypto.randomUUID()}`;
    const old = new Dexie(name);
    const db = new MonosaiDatabase(name);
    try {
      old.version(13).stores(V13_STORES);
      await old.open();
      await old.table('settings').put({
        key: 'app',
        v: 1,
        value: { activeSnapshotId: SNAPSHOT_ID },
      });
      await old.table('vocabularySnapshots').put(SNAPSHOT);
      await old.table('vocabularyItems').put(ITEM);
      await old.table('vocabularyProvenance').put(PROVENANCE);
      await old.table('vocabularySources').put(SOURCE);
      await old.table('vocabularySourceCaches').put(CACHE);
      old.close();

      await db.open();

      expect(db.verno).toBe(14);
      expect(await db.table('settings').get('app')).toEqual({
        key: 'app',
        v: 1,
        value: { activeSnapshotId: SNAPSHOT_ID },
      });
      expect(await db.vocabularySnapshots.get(SNAPSHOT_ID)).toEqual(SNAPSHOT);
      expect(await db.vocabularyItems.get(ITEM_ID)).toEqual(ITEM);
      expect(await db.vocabularyProvenance.toArray()).toEqual([PROVENANCE]);
      expect(await db.vocabularySources.get(SOURCE_ID)).toEqual(SOURCE);
      expect(await db.vocabularySourceCaches.get(SOURCE_ID)).toEqual(CACHE);
      expect((await db.vocabularyItems.get(ITEM_ID))?.meaning).toBeUndefined();
      expect((await db.vocabularySources.get(SOURCE_ID) as { meaningFieldName?: string } | undefined)?.meaningFieldName).toBeUndefined();
      expect((await db.vocabularySourceCaches.get(SOURCE_ID))?.entries[0]?.rawMeaning).toBeUndefined();
      expect((await db.vocabularyProvenance.toArray())[0]?.meaningFieldName).toBeUndefined();
    } finally {
      old.close();
      db.close();
      await Dexie.delete(name);
    }
  });
});
