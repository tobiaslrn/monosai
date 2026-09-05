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
import { assetId, jobId } from '../../domain/shared/ids';
import { DexieJobRepository } from './repositories/dexie-job.repository';
import { uuid } from '../../../testing/persistence-fixtures';

const clock = fixedClock(1_700_800_000_000);

/** Only the fields the v8 backfill is asserted on; the row itself is untyped storage. */
interface UpgradedReadingRow {
  readonly id: string;
  readonly title: string;
  readonly preparationTargets: readonly string[];
}

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
    expect(tableNames).toEqual(
      Object.entries(SCHEMA_VERSIONS.at(-1)!.stores)
        .filter(([, schema]) => schema !== null)
        .map(([name]) => name)
        .sort(),
    );
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

      expect(upgraded.verno).toBe(CURRENT_SCHEMA_VERSION);
      expect(await upgraded.table('settings').get('preserved')).toEqual({
        key: 'preserved',
        value: true,
      });
      expect(upgraded.tables.map((table) => table.name).sort()).toEqual(
        Object.entries(SCHEMA_VERSIONS.at(-1)!.stores)
          .filter(([, schema]) => schema !== null)
          .map(([name]) => name)
          .sort(),
      );
      expect(upgraded.tables.some((table) => table.name === 'readingProgress')).toBe(false);
      upgraded.close();
    } finally {
      stale.close();
      await Dexie.delete(name);
    }
  });

  it('migrates existing Anki mappings into automatic vocabulary sources', async () => {
    const name = `monosai-v2-vocabulary-${Date.now()}`;
    const legacy = new Dexie(name);
    legacy.version(2).stores({
      sourceMappings: '&id, providerKind, [deckName+noteTypeName]',
      vocabularySnapshots: '&id, createdAt, uniqueEntryCount',
      vocabularyProvenance: '++id, vocabularyItemId, sourceMappingId',
    });
    const id = uuid(9100);

    try {
      await legacy.open();
      await legacy.table('sourceMappings').add({
        v: 1,
        id,
        providerKind: 'desktop-connect',
        deckName: 'Core Japanese',
        deckScope: 'deck-only',
        noteTypeName: 'Basic',
        expressionFieldName: 'Expression',
        enabled: true,
        createdAt: 100,
        updatedAt: 200,
      });
      legacy.close();

      const upgraded = new MonosaiDatabase(name);
      await upgraded.open();

      expect(await upgraded.vocabularySources.get(id)).toMatchObject({
        id,
        kind: 'anki-connect',
        automaticSync: true,
        label: 'Anki · Core Japanese · Expression',
        lastSyncedAt: null,
      });
      expect(upgraded.tables.some((table) => table.name === 'sourceMappings')).toBe(false);
      upgraded.close();
    } finally {
      legacy.close();
      await Dexie.delete(name);
    }
  });

  it('defaults every pre-instructions voice preset conservatively during the v6 upgrade', async () => {
    const name = `monosai-v5-tts-${Date.now()}`;
    const legacy = new Dexie(name);
    const v5 = SCHEMA_VERSIONS.find((entry) => entry.version === 5);
    if (v5 === undefined) {
      throw new Error('The immutable v5 schema is missing.');
    }
    legacy.version(5).stores(v5.stores);

    try {
      await legacy.open();
      await legacy.table('settings').put({
        key: 'tts',
        v: 1,
        value: {
          modelId: 'vendor/voice',
          voiceId: 'sakura',
          speed: 1,
          lastTestFingerprint: null,
          lastTestedAt: null,
          activePresetId: 'voice-1',
          presets: [
            {
              id: 'voice-1',
              name: 'Voice',
              modelId: 'vendor/voice',
              voiceId: 'sakura',
              speed: 1,
              lastTestFingerprint: null,
              lastTestedAt: null,
            },
          ],
        },
      });
      legacy.close();

      const upgraded = new MonosaiDatabase(name);
      await upgraded.open();
      const row = (await upgraded.settings.get('tts')) as
        { readonly value?: Record<string, unknown> } | undefined;
      expect(row?.value?.['speechInstructions']).toBe('unsupported');
      expect(row?.value?.['presets']).toEqual([
        expect.objectContaining({ id: 'voice-1', speechInstructions: 'unsupported' }),
      ]);
      upgraded.close();
    } finally {
      legacy.close();
      await Dexie.delete(name);
    }
  });

  it('adds measured speed support to every stored voice row during the v7 upgrade', async () => {
    const name = `monosai-v6-tts-${Date.now()}`;
    const legacy = new Dexie(name);
    const v6 = SCHEMA_VERSIONS.find((entry) => entry.version === 6);
    if (v6 === undefined) {
      throw new Error('The immutable v6 schema is missing.');
    }
    legacy.version(6).stores(v6.stores);

    try {
      await legacy.open();
      await legacy.table('settings').put({
        key: 'tts',
        v: 1,
        value: {
          modelId: 'vendor/voice',
          voiceId: 'sakura',
          speed: 1.25,
          speechInstructions: 'unsupported',
          lastTestFingerprint: 'stored-fingerprint',
          lastTestedAt: 1_700_000_000_000,
          activePresetId: 'voice-1',
          favoriteModelIds: ['vendor/voice'],
          presets: [
            {
              id: 'voice-1',
              name: 'Voice',
              modelId: 'vendor/voice',
              voiceId: 'sakura',
              speed: 1.25,
              speechInstructions: 'unsupported',
              lastTestFingerprint: 'stored-fingerprint',
              lastTestedAt: 1_700_000_000_000,
            },
            {
              id: 'gemini-1',
              name: 'Gemini',
              modelId: 'google/gemini-3.1-flash-tts-preview',
              voiceId: 'Kore',
              speed: 1,
              speechInstructions: 'unsupported',
              lastTestFingerprint: null,
              lastTestedAt: null,
            },
          ],
        },
      });
      legacy.close();

      const upgraded = new MonosaiDatabase(name);
      await upgraded.open();
      const row = (await upgraded.settings.get('tts')) as
        { readonly value?: Record<string, unknown> } | undefined;

      // Purely additive: the seeded value is what the code already assumed, and
      // no stored field is touched. The real value arrives with the re-test
      // that the bumped TTS_TEST_VERSION already forces.
      expect(row?.value).toMatchObject({
        modelId: 'vendor/voice',
        voiceId: 'sakura',
        speed: 1.25,
        speedSupported: true,
        speechInstructions: 'unsupported',
        lastTestFingerprint: 'stored-fingerprint',
        lastTestedAt: 1_700_000_000_000,
        activePresetId: 'voice-1',
        favoriteModelIds: ['vendor/voice'],
      });
      expect(row?.value?.['presets']).toEqual([
        expect.objectContaining({
          id: 'voice-1',
          name: 'Voice',
          speed: 1.25,
          speedSupported: true,
          lastTestFingerprint: 'stored-fingerprint',
        }),
        // Gemini ignores the parameter, so its seed says so from the start.
        expect.objectContaining({ id: 'gemini-1', speedSupported: false }),
      ]);
      upgraded.close();
    } finally {
      legacy.close();
      await Dexie.delete(name);
    }
  });

  it('backfills preparation targets from stored aid evidence during the v8 upgrade', async () => {
    const name = `monosai-v7-preparation-${Date.now()}`;
    const legacy = new Dexie(name);
    const v7 = SCHEMA_VERSIONS.find((entry) => entry.version === 7);
    if (v7 === undefined) {
      throw new Error('The immutable v7 schema is missing.');
    }
    legacy.version(7).stores(v7.stores);
    const summaries = [
      {
        id: 'not-requested',
        sentenceCount: 3,
        translationSummary: { total: 3, completed: 1, failed: 0 },
        grammarSummary: { state: 'not-requested' },
        audioSummary: { total: 3, completed: 0, failed: 0 },
      },
      {
        id: 'partial',
        sentenceCount: 3,
        translationSummary: { total: 3, completed: 0, failed: 0 },
        grammarSummary: { state: 'partial', analyzedSentenceCount: 1, concernCount: 0 },
        audioSummary: { total: 3, completed: 1, failed: 0 },
      },
      {
        id: 'complete',
        sentenceCount: 3,
        translationSummary: { total: 3, completed: 0, failed: 0 },
        grammarSummary: { state: 'complete', concernCount: 0 },
        audioSummary: { total: 3, completed: 0, failed: 0 },
      },
      {
        id: 'unavailable',
        sentenceCount: 3,
        translationSummary: { total: 3, completed: 0, failed: 0 },
        grammarSummary: { state: 'unavailable', reasonCode: 'provider-unavailable' },
        audioSummary: { total: 3, completed: 0, failed: 0 },
      },
      {
        id: 'empty',
        sentenceCount: 0,
        translationSummary: { total: 0, completed: 1, failed: 0 },
        grammarSummary: { state: 'complete', concernCount: 0 },
        audioSummary: { total: 0, completed: 1, failed: 0 },
      },
    ];

    try {
      await legacy.open();
      await legacy.table('readings').bulkPut(
        summaries.map((summary) => ({
          ...summary,
          kind: 'imported',
          title: `Preserved ${summary.id}`,
        })),
      );
      legacy.close();

      const upgraded = new MonosaiDatabase(name);
      await upgraded.open();
      const rows = (await upgraded.table('readings').toArray()) as UpgradedReadingRow[];
      const byId = new Map(rows.map((row) => [row.id, row]));

      expect(byId.get('not-requested')?.preparationTargets).toEqual(['english']);
      expect(byId.get('partial')?.preparationTargets).toEqual(['grammar', 'audio']);
      expect(byId.get('complete')?.preparationTargets).toEqual(['grammar']);
      expect(byId.get('unavailable')?.preparationTargets).toEqual([]);
      expect(byId.get('empty')?.preparationTargets).toEqual([]);
      expect(byId.get('partial')?.title).toBe('Preserved partial');
      expect(rows).toHaveLength(summaries.length);
      upgraded.close();
    } finally {
      legacy.close();
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

    expect(status.ok && status.value.supported).toBe(false);
    expect(status.ok && status.value.persisted).toBe(false);
    expect(status.ok && status.value.canRequest).toBe(false);
    expect(status.ok && status.value.usageBytes).toBeNull();
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

    expect(status.ok && status.value.supported).toBe(true);
    expect(status.ok && status.value.canRequest).toBe(true);
    expect(status.ok && status.value.usageBytes).toBe(1024);
    expect(status.ok && status.value.quotaBytes).toBe(4096);
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

  it('clears audio and audio jobs for one reading without touching another', async () => {
    const readings = new DexieReadingRepository(db, clock);
    const enrichment = new DexieEnrichmentRepository(db);
    const jobs = new DexieJobRepository(db, clock);
    const target = importedReadingFixture({ seed: 31 });
    const other = importedReadingFixture({ seed: 32 });
    await readings.saveImportedReading(target);
    await readings.saveImportedReading(other);

    for (const [draft, key, seed] of [
      [target, 'target-audio', 9300],
      [other, 'other-audio', 9400],
    ] as const) {
      await enrichment.storeAudio(
        {
          id: assetId(uuid(seed)),
          sentenceId: draft.sentences[0].id,
          readingId: draft.reading.id,
          sourceContentHash: draft.sentences[0].contentHash,
          modelId: 'vendor/tts',
          voiceId: 'voice-a',
          optionsFingerprint: 'fingerprint',
          mimeType: 'audio/mpeg',
          byteLength: 2,
          blob: new Blob([new Uint8Array([1, 2])], { type: 'audio/mpeg' }),
          cacheKey: key,
          createdAt: 1_700_800_000_000,
        },
        new Map([[draft.sentences[0].id, key]]),
      );
      await jobs.create({
        id: jobId(uuid(seed + 1)),
        kind: 'prepare-audio',
        readingId: draft.reading.id,
        state: 'complete',
        orderedSentenceIds: [draft.sentences[0].id],
        completedSentenceIds: [draft.sentences[0].id],
        failedItems: [],
        configFingerprint: 'fingerprint',
        createdAt: 1_700_800_000_000,
        updatedAt: 1_700_800_000_000,
      });
    }

    const cleared = await maintenance.clearReadingAudio(target.reading.id);

    expect(cleared.ok).toBe(true);
    expect(await db.audioAssets.where('readingId').equals(target.reading.id).count()).toBe(0);
    expect(await db.audioAssets.where('readingId').equals(other.reading.id).count()).toBe(1);
    expect(await db.assetJobs.where('readingId').equals(target.reading.id).count()).toBe(0);
    expect(await db.assetJobs.where('readingId').equals(other.reading.id).count()).toBe(1);
    const targetReading = await readings.getReading(target.reading.id);
    const otherReading = await readings.getReading(other.reading.id);
    expect(targetReading.ok && targetReading.value?.audioSummary.completed).toBe(0);
    expect(otherReading.ok && otherReading.value?.audioSummary.completed).toBe(1);
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
    expect(status.ok && status.value.persisted).toBe(true);
  });

  it('skips the persist call when the browser exposes no storage manager', async () => {
    const status = await maintenance.requestPersistence();

    expect(status).toEqual({
      ok: true,
      value: {
        supported: false,
        persisted: false,
        canRequest: false,
        usageBytes: null,
        quotaBytes: null,
      },
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
