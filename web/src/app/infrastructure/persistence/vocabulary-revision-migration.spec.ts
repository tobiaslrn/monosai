import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSIONS } from './migrations';
import { MonosaiDatabase } from './monosai-db';

const V12_STORES = SCHEMA_VERSIONS.find((version) => version.version === 12)!.stores;

/** A snapshot row exactly as version 12 wrote one, with no revision. */
const LEGACY_SNAPSHOT = {
  v: 1,
  id: '11111111-1111-4111-8111-111111111111',
  createdAt: 1_700_000_000_000,
  status: 'complete',
  uniqueEntryCount: 2,
  sourceIds: ['22222222-2222-4222-8222-222222222222'],
  sourceKinds: ['anki-connect'],
  analyzerVersion: 'test-analyzer-1',
  normalizationVersion: 'test-normalizer-1',
  stats: {
    sourcesQueried: 1,
    entriesRead: 2,
    nonEmptyValues: 2,
    rejectedEmptyValues: 0,
    duplicateOccurrences: 0,
    uniqueExpressions: 2,
    sourceWarnings: [],
  },
};

const LEGACY_SETTINGS = {
  key: 'app',
  v: 1,
  value: {
    helpIntroSeen: true,
    theme: 'dark',
    activeSnapshotId: LEGACY_SNAPSHOT.id,
    ankiConnectPort: 8765,
    ankiWordPriorityMode: 'difficult',
    updatedAt: 1_700_000_000_000,
  },
};

async function withUpgradedDatabase(
  seed: (old: Dexie) => Promise<void>,
  assert: (db: MonosaiDatabase) => Promise<void>,
): Promise<void> {
  const name = `vocabulary-revision-${crypto.randomUUID()}`;
  const old = new Dexie(name);
  old.version(12).stores(V12_STORES);
  const db = new MonosaiDatabase(name);
  try {
    await old.open();
    await seed(old);
    old.close();

    await db.open();
    await assert(db);
  } finally {
    old.close();
    db.close();
    await Dexie.delete(name);
  }
}

describe('schema v13 vocabulary revisions', () => {
  it('gives a vocabulary stored before revisions existed one it can be compared by', async () => {
    await withUpgradedDatabase(
      async (old) => {
        await old.table('vocabularySnapshots').put(LEGACY_SNAPSHOT);
      },
      async (db) => {
        const upgraded = await db.vocabularySnapshots.get(LEGACY_SNAPSHOT.id);
        expect(upgraded?.revision).toBe(`legacy-${LEGACY_SNAPSHOT.createdAt}`);
        // Nothing else about the stored vocabulary changes, and in particular
        // the id stays the one every generated story already points at.
        expect(upgraded?.id).toBe(LEGACY_SNAPSHOT.id);
        expect(upgraded?.uniqueEntryCount).toBe(LEGACY_SNAPSHOT.uniqueEntryCount);
        expect(upgraded?.createdAt).toBe(LEGACY_SNAPSHOT.createdAt);
        expect(upgraded?.stats).toEqual(LEGACY_SNAPSHOT.stats);
      },
    );
  });

  it('keeps the settings the learner had chosen', async () => {
    await withUpgradedDatabase(
      async (old) => {
        await old.table('vocabularySnapshots').put(LEGACY_SNAPSHOT);
        await old.table('settings').put(LEGACY_SETTINGS);
      },
      async (db) => {
        const settings = await db.settings.get('app');
        expect(settings?.value).toEqual(LEGACY_SETTINGS.value);
      },
    );
  });

  it('upgrades a database that has no vocabulary yet', async () => {
    await withUpgradedDatabase(
      async () => {
        await Promise.resolve();
      },
      async (db) => {
        expect(await db.vocabularySnapshots.count()).toBe(0);
      },
    );
  });
});
