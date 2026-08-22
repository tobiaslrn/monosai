import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Dexie from 'dexie';
import { fixedClock } from '../../domain/shared/clock';
import { createTestDatabase, destroyTestDatabase } from '../../../testing/test-database';
import { importedReadingFixture, snapshotFixture } from '../../../testing/persistence-fixtures';
import { CURRENT_SCHEMA_VERSION, SCHEMA_VERSIONS } from './migrations';
import { MonosaiDatabase } from './monosai-db';
import {
  BrowserStorageMaintenance,
  resolveMaintenanceDependencies,
} from './browser-storage-maintenance';
import { DexieEnrichmentRepository } from './repositories/dexie-enrichment.repository';
import { DexieReadingRepository } from './repositories/dexie-reading.repository';
import { DexieVocabularyRepository } from './repositories/dexie-vocabulary.repository';
import { assetId } from '../../domain/shared/ids';
import { uuid } from '../../../testing/persistence-fixtures';

const clock = fixedClock(1_700_800_000_000);

describe('database schema', () => {
  let db: MonosaiDatabase;

  beforeEach(async () => {
    db = await createTestDatabase();
  });

  afterEach(async () => {
    await destroyTestDatabase(db);
  });

  it('declares monotonic versions with the newest last', () => {
    const versions = SCHEMA_VERSIONS.map((entry) => entry.version);

    expect(versions).toEqual([...versions].sort((a, b) => a - b));
    expect(new Set(versions).size).toBe(versions.length);
    expect(CURRENT_SCHEMA_VERSION).toBe(versions[versions.length - 1]);
  });

  it('creates a fresh database at the current version with every required table', () => {
    expect(db.verno).toBe(CURRENT_SCHEMA_VERSION);

    const tableNames = db.tables.map((table) => table.name).sort();
    expect(tableNames).toEqual(Object.keys(SCHEMA_VERSIONS[0].stores).sort());
  });

  it('does not index large text, tokens, blobs, or credentials', () => {
    const forbidden = ['apiKey', 'blob', 'bytes', 'tokens', 'sourceText', 'japaneseText', 'textEn'];

    for (const table of db.tables) {
      const indexed = [
        table.schema.primKey.keyPath,
        ...table.schema.indexes.map((index) => index.keyPath),
      ]
        .flat()
        .filter((keyPath): keyPath is string => typeof keyPath === 'string');

      for (const keyPath of indexed) {
        expect(forbidden).not.toContain(keyPath);
      }
    }
  });

  it('reopens an existing database without data loss', async () => {
    const readings = new DexieReadingRepository(db, clock);
    const draft = importedReadingFixture();
    await readings.saveImportedReading(draft);

    db.close();
    await db.open();

    const reloaded = await new DexieReadingRepository(db, clock).getReading(draft.reading.id);
    expect(reloaded.ok && reloaded.value?.title).toBe(draft.reading.title);
  });

  it('reconciles a stale development v1 schema into v2 without deleting existing records', async () => {
    const name = `monosai-stale-v1-${Date.now()}`;
    const stale = new Dexie(name);
    stale.version(1).stores({
      settings: '&key',
      readings: '&id',
      readingProgress: '&readingId, lastOpenedAt',
    });

    try {
      await stale.open();
      await stale.table('settings').add({ key: 'preserved', value: true });
      stale.close();

      const upgraded = new MonosaiDatabase(name);
      await upgraded.open();

      expect(upgraded.verno).toBe(2);
      expect(await upgraded.table('settings').get('preserved')).toEqual({
        key: 'preserved',
        value: true,
      });
      expect(upgraded.tables.map((table) => table.name).sort()).toEqual(
        Object.keys(SCHEMA_VERSIONS[SCHEMA_VERSIONS.length - 1].stores).sort(),
      );
      expect(upgraded.tables.some((table) => table.name === 'readingProgress')).toBe(false);
      upgraded.close();
    } finally {
      stale.close();
      await Dexie.delete(name);
    }
  });
});

describe('storage failure handling', () => {
  let db: MonosaiDatabase;

  beforeEach(async () => {
    db = await createTestDatabase();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await destroyTestDatabase(db);
  });

  it('reports a quota failure and leaves previously committed data intact', async () => {
    const readings = new DexieReadingRepository(db, clock);
    const first = importedReadingFixture({ seed: 1 });
    await readings.saveImportedReading(first);

    const quotaError = new Error('quota');
    quotaError.name = 'QuotaExceededError';
    const spy = vi.spyOn(db.sentences, 'bulkAdd').mockRejectedValue(quotaError);

    const second = importedReadingFixture({ seed: 2 });
    const saved = await readings.saveImportedReading(second);

    expect(saved.ok).toBe(false);
    if (saved.ok) {
      return;
    }
    expect(saved.error.code).toBe('quota');

    spy.mockRestore();
    expect(await db.readings.count()).toBe(1);
    expect((await readings.getReading(first.reading.id)).ok).toBe(true);
    expect((await readings.getReading(second.reading.id)).ok).toBe(true);
    expect(await db.paragraphs.where('readingId').equals(second.reading.id).count()).toBe(0);
  });

  it('rolls back an aborted snapshot commit and keeps the previous active snapshot', async () => {
    const vocabulary = new DexieVocabularyRepository(db);
    const first = snapshotFixture(1);
    await vocabulary.commitSnapshot(first);

    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    const spy = vi.spyOn(db.vocabularyProvenance, 'bulkAdd').mockRejectedValue(abortError);

    const second = snapshotFixture(2);
    const committed = await vocabulary.commitSnapshot(second);

    expect(committed.ok).toBe(false);
    if (committed.ok) {
      return;
    }
    expect(committed.error.code).toBe('transaction-aborted');

    spy.mockRestore();
    const active = await vocabulary.getActiveSnapshot();
    expect(active.ok && active.value?.id).toBe(first.snapshot.id);
    expect(await db.vocabularySnapshots.count()).toBe(1);
    expect(await db.vocabularyItems.count()).toBe(first.items.length);
  });
});

describe('BrowserStorageMaintenance', () => {
  let db: MonosaiDatabase;
  let maintenance: BrowserStorageMaintenance;

  beforeEach(async () => {
    db = await createTestDatabase();
    maintenance = new BrowserStorageMaintenance(db, undefined, undefined);
  });

  afterEach(async () => {
    await destroyTestDatabase(db);
  });

  it('reports unknown persistence when the browser exposes no storage manager', async () => {
    const status = await maintenance.getPersistenceStatus();

    expect(status.persisted).toBe(false);
    expect(status.canRequest).toBe(false);
    expect(status.usageBytes).toBeNull();
  });

  it('reports persistence status from the storage manager', async () => {
    const navigatorStub = {
      storage: {
        persisted: () => Promise.resolve(false),
        persist: () => Promise.resolve(true),
        estimate: () => Promise.resolve({ usage: 1024, quota: 4096 }),
      },
    } as unknown as Navigator;

    const status = await new BrowserStorageMaintenance(
      db,
      navigatorStub,
      undefined,
    ).getPersistenceStatus();

    expect(status.canRequest).toBe(true);
    expect(status.usageBytes).toBe(1024);
    expect(status.quotaBytes).toBe(4096);
  });

  it('clears audio blobs and audio jobs while keeping readings and translations', async () => {
    const readings = new DexieReadingRepository(db, clock);
    const enrichment = new DexieEnrichmentRepository(db);
    const draft = importedReadingFixture();
    await readings.saveImportedReading(draft);

    await enrichment.storeAudio(
      {
        id: assetId(uuid(9100)),
        sentenceId: draft.sentences[0].id,
        readingId: draft.reading.id,
        sourceContentHash: draft.sentences[0].contentHash,
        modelId: 'vendor/tts',
        voiceId: 'voice-a',
        optionsFingerprint: 'fingerprint',
        mimeType: 'audio/mpeg',
        byteLength: 2,
        blob: new Blob([new Uint8Array([1, 2])], { type: 'audio/mpeg' }),
        cacheKey: 'audio-key',
        createdAt: 1_700_800_000_000,
      },
      new Map([[draft.sentences[0].id, 'audio-key']]),
    );
    await enrichment.storeTranslation(
      {
        id: uuid(9200),
        sentenceId: draft.sentences[0].id,
        readingId: draft.reading.id,
        sourceContentHash: draft.sentences[0].contentHash,
        textEn: 'The cat likes it.',
        modelId: 'vendor/text',
        promptVersion: 'v1',
        cacheKey: 'translation-key',
        createdAt: 1_700_800_000_000,
      },
      new Map([[draft.sentences[0].id, 'translation-key']]),
    );

    const cleared = await maintenance.clearAudioCache();

    expect(cleared.ok).toBe(true);
    expect(await db.audioAssets.count()).toBe(0);
    expect(await db.translations.count()).toBe(1);
    expect(await db.readings.count()).toBe(1);

    const reading = await readings.getReading(draft.reading.id);
    expect(reading.ok && reading.value?.audioSummary.completed).toBe(0);
    expect(reading.ok && reading.value?.translationSummary.completed).toBe(1);
  });

  it('requests persistence and reports the refreshed status when a storage manager exists', async () => {
    const persist = vi.fn(() => Promise.resolve(true));
    const navigatorStub = {
      storage: {
        persisted: () => Promise.resolve(true),
        persist,
        estimate: () => Promise.resolve({ usage: 512, quota: 2048 }),
      },
    } as unknown as Navigator;

    const status = await new BrowserStorageMaintenance(
      db,
      navigatorStub,
      undefined,
    ).requestPersistence();

    expect(persist).toHaveBeenCalledTimes(1);
    expect(status.persisted).toBe(true);
  });

  it('skips the persist call when the browser exposes no storage manager', async () => {
    const status = await maintenance.requestPersistence();

    expect(status).toEqual({
      persisted: false,
      canRequest: false,
      usageBytes: null,
      quotaBytes: null,
    });
  });

  it('resets all data without touching caches when none are given', async () => {
    const result = await maintenance.resetAllData();

    expect(result.ok).toBe(true);
  });

  it('clears every cache key when resetting all data', async () => {
    const deleted: string[] = [];
    const cachesStub = {
      keys: () => Promise.resolve(['a', 'b']),
      delete: (key: string) => {
        deleted.push(key);
        return Promise.resolve(true);
      },
    } as unknown as CacheStorage;

    const result = await new BrowserStorageMaintenance(db, undefined, cachesStub).resetAllData();

    expect(result.ok).toBe(true);
    expect(deleted).toEqual(['a', 'b']);
  });
});

describe('resolveMaintenanceDependencies', () => {
  it('resolves nothing when there is no window', () => {
    expect(resolveMaintenanceDependencies(null)).toEqual({
      navigatorRef: undefined,
      caches: undefined,
    });
  });

  it('resolves the navigator without caches when the window lacks a cache store', () => {
    const view = { navigator: {} } as unknown as Window;

    const resolved = resolveMaintenanceDependencies(view);

    expect(resolved.navigatorRef).toBe(view.navigator);
    expect(resolved.caches).toBeUndefined();
  });

  it('resolves caches when the window exposes them', () => {
    const cachesStub = {} as CacheStorage;
    const view = { navigator: {}, caches: cachesStub } as unknown as Window;

    expect(resolveMaintenanceDependencies(view).caches).toBe(cachesStub);
  });
});
