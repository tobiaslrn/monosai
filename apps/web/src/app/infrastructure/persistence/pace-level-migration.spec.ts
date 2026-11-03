import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSIONS } from './migrations';
import { MonosaiDatabase } from './monosai-db';

describe('schema v16 to v17 named speech pace migration', () => {
  it('adds natural pace, retires 0.7, and preserves the rest of the data', async () => {
    const name = `monosai-pace-level-${String(Date.now())}`;
    const legacy = new Dexie(name);
    const v16 = SCHEMA_VERSIONS.find((entry) => entry.version === 16);
    if (v16 === undefined) {
      throw new Error('The immutable v16 schema is missing.');
    }
    legacy.version(16).stores(v16.stores);
    let upgraded: MonosaiDatabase | undefined;

    try {
      await legacy.open();
      await legacy.table('settings').bulkPut([
        {
          key: 'tts',
          v: 1,
          value: {
            modelId: 'vendor/voice',
            voiceId: 'sakura',
            speechStyle: 'clear',
            speechInstructions: 'supported',
            lastTestFingerprint: 'tested-v16',
            lastTestedAt: 1_700_000_000_000,
            activePresetId: 'voice-1',
            favoriteModelIds: ['vendor/voice'],
            presets: [
              {
                id: 'voice-1',
                name: 'Voice',
                modelId: 'vendor/voice',
                voiceId: 'sakura',
                speechStyle: 'clear',
                speechInstructions: 'supported',
                lastTestFingerprint: 'tested-v16',
                lastTestedAt: 1_700_000_000_000,
              },
            ],
          },
        },
        {
          key: 'reader-preferences',
          v: 1,
          value: {
            furigana: false,
            tokenSpacing: true,
            warningMarkers: false,
            textScale: 1.25,
            playbackRate: 0.7,
            updatedAt: 1_700_000_000_000,
          },
        },
      ]);
      await legacy.table('audioAssets').put({
        v: 1,
        id: 'asset-v16',
        cacheKey: 'legacy-v16-audio',
        sentenceId: 'sentence-v16',
        readingId: 'reading-v16',
        sourceContentHash: 'content-v16',
        modelId: 'vendor/voice',
        voiceId: 'sakura',
        optionsFingerprint: 'legacy-options',
        mimeType: 'audio/mpeg',
        byteLength: 3,
        createdAt: 1_700_000_000_000,
        bytes: new Uint8Array([1, 2, 3]).buffer,
      });
      legacy.close();

      upgraded = new MonosaiDatabase(name);
      await upgraded.open();

      const tts = await upgraded.settings.get('tts');
      expect(tts?.value).toMatchObject({
        modelId: 'vendor/voice',
        voiceId: 'sakura',
        speechStyle: 'clear',
        speechPace: 'natural',
        speechInstructions: 'supported',
        lastTestFingerprint: 'tested-v16',
        favoriteModelIds: ['vendor/voice'],
      });
      const presets = (tts?.value as { presets?: readonly Record<string, unknown>[] } | undefined)
        ?.presets;
      expect(presets).toEqual([
        expect.objectContaining({
          id: 'voice-1',
          name: 'Voice',
          speechStyle: 'clear',
          speechPace: 'natural',
          speechInstructions: 'supported',
          lastTestFingerprint: 'tested-v16',
        }),
      ]);

      const reader = await upgraded.settings.get('reader-preferences');
      expect(reader?.value).toMatchObject({
        furigana: false,
        tokenSpacing: true,
        warningMarkers: false,
        textScale: 1.25,
        playbackRate: 0.8,
        updatedAt: 1_700_000_000_000,
      });

      const audio = await upgraded.audioAssets.get('legacy-v16-audio');
      expect(audio).toBeDefined();
      expect(audio?.pace).toBeUndefined();
      expect(audio?.bytes.byteLength).toBe(3);
    } finally {
      upgraded?.close();
      legacy.close();
      await Dexie.delete(name);
    }
  });
});
