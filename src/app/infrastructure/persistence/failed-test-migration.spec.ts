import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { DEFAULT_TEXT_MODEL_SETTINGS } from '../../domain/settings/settings';
import { fixedClock } from '../../domain/shared/clock';
import { SCHEMA_VERSIONS } from './migrations';
import { MonosaiDatabase } from './monosai-db';
import { DexieSettingsRepository } from './repositories/dexie-settings.repository';

describe('schema v10 failed configuration tests', () => {
  it.each([false, true])('preserves v9 data and handles corrupt settings: %s', async (corrupt) => {
    const name = `failed-tests-${crypto.randomUUID()}`;
    const old = new Dexie(name);
    old.version(9).stores(SCHEMA_VERSIONS.find((version) => version.version === 9)!.stores);
    const db = new MonosaiDatabase(name);
    try {
      await old.open();
      await old
        .table('settings')
        .put({
          key: 'text-model',
          v: 1,
          value: corrupt ? null : { ...DEFAULT_TEXT_MODEL_SETTINGS, modelId: 'saved/model' },
        });
      old.close();
      if (corrupt) {
        await expect(db.open()).rejects.toThrow('model settings');
        await old.open();
        expect(old.verno).toBe(9);
        expect(
          ((await old.table('settings').get('text-model')) as { value: unknown }).value,
        ).toBeNull();
      } else {
        await db.open();
        const repository = new DexieSettingsRepository(db, fixedClock(100));
        const loaded = await repository.getTextModelSettings();
        expect(loaded.ok && loaded.value.modelId).toBe('saved/model');
        expect(loaded.ok && loaded.value.failedTests).toEqual([]);
        const failure = {
          fingerprint: 'fp',
          testedAt: 100,
          code: 'authentication' as const,
          message: 'The provider rejected the saved key.',
        };
        await repository.updateTextModelSettings({ failedTests: [failure] });
        db.close();
        await db.open();
        const reloaded = await repository.getTextModelSettings();
        expect(reloaded.ok && reloaded.value.failedTests).toEqual([failure]);
      }
    } finally {
      old.close();
      db.close();
      await Dexie.delete(name);
    }
  });
});
