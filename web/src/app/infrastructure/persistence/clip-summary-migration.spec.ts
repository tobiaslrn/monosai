import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION, SCHEMA_VERSIONS } from './migrations';
import { MonosaiDatabase } from './monosai-db';
import { DexieEnrichmentRepository } from './repositories/dexie-enrichment.repository';

const V19_STORES = SCHEMA_VERSIONS.find((version) => version.version === 19)!.stores;

/** A clip as version 19 stored it: metadata and bytes in one row. */
function storedClip(index: number) {
  return {
    v: 1,
    id: `4444444${String(index)}-4444-4444-8444-444444444444`,
    cacheKey: `clip-${String(index)}`,
    sentenceId: `5555555${String(index)}-5555-4555-8555-555555555555`,
    readingId: '66666666-6666-4666-8666-666666666666',
    sourceContentHash: `hash-${String(index)}`,
    modelId: 'vendor/tts-model',
    voiceId: 'voice-a',
    optionsFingerprint: 'tts-fingerprint',
    mimeType: 'audio/webm' as const,
    byteLength: 3,
    bytes: new Uint8Array([index, 2, 3]).buffer,
    createdAt: 1_700_000_000_000 + index,
  };
}

async function withUpgradedDatabase(
  clips: readonly ReturnType<typeof storedClip>[],
  assert: (db: MonosaiDatabase) => Promise<void>,
): Promise<void> {
  const name = `clip-summaries-${crypto.randomUUID()}`;
  const old = new Dexie(name);
  old.version(19).stores(V19_STORES);
  const db = new MonosaiDatabase(name);
  try {
    await old.open();
    await old.table('audioAssets').bulkAdd([...clips]);
    old.close();

    await db.open();
    await assert(db);
  } finally {
    old.close();
    db.close();
    await Dexie.delete(name);
  }
}

describe('schema v20 clip metadata', () => {
  it("copies every stored clip's metadata, leaving the clip itself as it was", async () => {
    const clips = [storedClip(1), storedClip(2)];
    await withUpgradedDatabase(clips, async (db) => {
      expect(db.verno).toBe(CURRENT_SCHEMA_VERSION);
      const summaries = await db.audioSummaries.orderBy(':id').toArray();
      expect(summaries).toEqual(clips.map(({ bytes: _bytes, ...metadata }) => metadata));
      const clip = await db.audioAssets.get('clip-1');
      expect(new Uint8Array(clip!.bytes)).toEqual(new Uint8Array([1, 2, 3]));
    });
  });

  it('lists clips stored before the upgrade', async () => {
    await withUpgradedDatabase([storedClip(1)], async (db) => {
      const listed = await new DexieEnrichmentRepository(db).listAudioSummariesForCacheKeys([
        'clip-1',
      ]);

      expect(listed.ok && listed.value.map((summary) => summary.cacheKey)).toEqual(['clip-1']);
    });
  });

  it('upgrades a database that has no clips', async () => {
    await withUpgradedDatabase([], async (db) => {
      expect(await db.audioSummaries.count()).toBe(0);
    });
  });
});
