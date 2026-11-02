import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { MonosaiDatabase } from './monosai-db';
import { SCHEMA_VERSIONS } from './migrations';

interface RawSettingRow {
  readonly value?: Record<string, unknown>;
}

interface RawAudioAsset {
  readonly pace?: unknown;
  readonly bytes: ArrayBuffer;
}

function applySchemaThrough(db: Dexie, maxVersion: number): void {
  for (const entry of SCHEMA_VERSIONS.filter(({ version }) => version <= maxVersion)) {
    const version = db.version(entry.version).stores(entry.stores);
    if (entry.upgrade !== undefined) {
      version.upgrade(entry.upgrade);
    }
  }
}

describe('schema v16 speech pace migration', () => {
  it.each([
    [0.65, 0.7],
    [1, 1],
    [1.5, 1],
  ])('snaps legacy TTS speed %s to reader playback rate %s', async (speed, expectedRate) => {
    const name = `monosai-pace-${String(speed)}-${String(Date.now())}`;
    const legacy = new Dexie(name);
    const v15 = SCHEMA_VERSIONS.find((entry) => entry.version === 15);
    if (v15 === undefined) {
      throw new Error('The immutable v15 schema is missing.');
    }
    legacy.version(15).stores(v15.stores);

    try {
      await legacy.open();
      await legacy.table('settings').bulkPut([
        {
          key: 'tts',
          v: 1,
          value: {
            modelId: 'vendor/voice',
            voiceId: 'sakura',
            speed,
            speechInstructions: 'unsupported',
            lastTestFingerprint: 'test',
            lastTestedAt: 1_700_000_000_000,
            activePresetId: 'voice-1',
            presets: [
              {
                id: 'voice-1',
                name: 'Voice',
                modelId: 'vendor/voice',
                voiceId: 'sakura',
                speed,
                speechInstructions: 'unsupported',
                lastTestFingerprint: 'test',
                lastTestedAt: 1_700_000_000_000,
              },
            ],
          },
        },
        {
          key: 'reader-preferences',
          v: 1,
          value: {
            furigana: true,
            tokenSpacing: true,
            warningMarkers: true,
            textScale: 1,
            updatedAt: 1_700_000_000_000,
          },
        },
      ]);
      await legacy.table('audioAssets').put({
        v: 1,
        id: 'asset-legacy',
        cacheKey: 'legacy-audio',
        sentenceId: 'sentence-legacy',
        readingId: 'reading-legacy',
        sourceContentHash: 'content-legacy',
        modelId: 'vendor/voice',
        voiceId: 'sakura',
        optionsFingerprint: 'legacy-options',
        mimeType: 'audio/mpeg',
        byteLength: 8,
        createdAt: 1_700_000_000_000,
        bytes: new TextEncoder().encode('old clip').buffer,
      });
      legacy.close();

      const upgraded = new Dexie(name);
      applySchemaThrough(upgraded, 16);
      await upgraded.open();
      const settings = upgraded.table<RawSettingRow, string>('settings');
      const audioAssets = upgraded.table<RawAudioAsset, string>('audioAssets');
      const preferences = await settings.get('reader-preferences');
      const tts = await settings.get('tts');

      expect(preferences?.value?.['playbackRate']).toBe(expectedRate);
      expect(tts?.value?.['speechStyle']).toBe('clear');
      const presets = tts?.value?.['presets'] as readonly Record<string, unknown>[] | undefined;
      expect(presets?.[0]?.['speechStyle']).toBe('clear');
      const rawTts = await settings.get('tts');
      expect(rawTts?.value).not.toHaveProperty('speed');
      expect(rawTts?.value).not.toHaveProperty('speedSupported');

      // Migration changes settings only; old audio remains available to the
      // content-hash fallback until a new clip is generated.
      expect(await audioAssets.count()).toBe(1);
      const audio = await audioAssets.get('legacy-audio');
      expect(audio).toBeDefined();
      expect(audio?.pace).toBeUndefined();
      expect(audio?.bytes.byteLength).toBe(8);
      upgraded.close();
    } finally {
      legacy.close();
      await Dexie.delete(name);
    }
  });

  it('creates the reader preference row when an old database had none', async () => {
    const name = `monosai-pace-no-reader-${String(Date.now())}`;
    const legacy = new Dexie(name);
    const v15 = SCHEMA_VERSIONS.find((entry) => entry.version === 15);
    if (v15 === undefined) {
      throw new Error('The immutable v15 schema is missing.');
    }
    legacy.version(15).stores(v15.stores);

    try {
      await legacy.open();
      await legacy.table('settings').put({
        key: 'tts',
        v: 1,
        value: {
          modelId: 'vendor/voice',
          voiceId: 'sakura',
          speed: 0.65,
          speechInstructions: 'unsupported',
          lastTestFingerprint: null,
          lastTestedAt: null,
          activePresetId: null,
          presets: [],
        },
      });
      legacy.close();

      const upgraded = new MonosaiDatabase(name);
      await upgraded.open();
      const settings = upgraded.table<RawSettingRow, string>('settings');
      const row = await settings.get('reader-preferences');
      expect(row?.value).toMatchObject({ playbackRate: 0.8, furigana: true, textScale: 1 });
      upgraded.close();
    } finally {
      legacy.close();
      await Dexie.delete(name);
    }
  });
});
