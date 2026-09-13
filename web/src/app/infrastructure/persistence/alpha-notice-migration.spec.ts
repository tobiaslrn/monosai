import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION, SCHEMA_VERSIONS } from './migrations';
import { MonosaiDatabase } from './monosai-db';

describe('schema v18 alpha disclosure', () => {
  it('adds an unacknowledged flag without changing existing app settings', async () => {
    const name = `alpha-v18-${crypto.randomUUID()}`;
    const old = new Dexie(name);
    old.version(17).stores(SCHEMA_VERSIONS.find((version) => version.version === 17)!.stores);
    const upgraded = new MonosaiDatabase(name);
    const value = {
      helpIntroSeen: true,
      theme: 'dark',
      activeSnapshotId: null,
      ankiConnectPort: 9999,
      ankiWordPriorityMode: 'recent',
      recentFocusSize: 50,
      updatedAt: 42,
    };
    try {
      await old.open();
      await old.table('settings').put({ key: 'app', v: 1, value });
      old.close();

      await upgraded.open();

      expect(upgraded.verno).toBe(CURRENT_SCHEMA_VERSION);
      expect((await upgraded.settings.get('app'))?.value).toEqual({
        ...value,
        alphaNoticeSeen: false,
      });
    } finally {
      old.close();
      upgraded.close();
      await Dexie.delete(name);
    }
  });
});
