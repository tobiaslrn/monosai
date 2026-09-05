import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION, SCHEMA_VERSIONS } from './migrations';
import { MonosaiDatabase } from './monosai-db';
import { appSettingsSchema } from './schemas/settings.schema';

describe('schema v9 Help introduction', () => {
  it.each(['present', 'missing', 'corrupt'] as const)(
    'preserves a v8 database with %s app settings',
    async (kind) => {
      const name = `help-v9-${kind}-${crypto.randomUUID()}`;
      const old = new Dexie(name);
      old.version(8).stores(SCHEMA_VERSIONS.find((v) => v.version === 8)!.stores);
      const value = {
        theme: 'dark',
        activeSnapshotId: null,
        ankiConnectPort: 9999,
        ankiWordPriorityMode: 'recent',
        updatedAt: 42,
      };
      const upgraded = new MonosaiDatabase(name);
      try {
        await old.open();
        await old.table('settings').put({ key: 'other', v: 1, value: { preserved: true } });
        if (kind !== 'missing') {
          await old
            .table('settings')
            .put({ key: 'app', v: 1, value: kind === 'corrupt' ? null : value });
        }
        old.close();
        if (kind === 'corrupt') {
          await expect(upgraded.open()).rejects.toThrow('app settings');
          await old.open();
          const retained = (await old.table('settings').get('app')) as { value: unknown };
          expect(retained.value).toBeNull();
          expect(old.verno).toBe(8);
        } else {
          await upgraded.open();
          expect(upgraded.verno).toBe(CURRENT_SCHEMA_VERSION);
          const row = await upgraded.settings.get('app');
          if (kind === 'present') {
            expect(row?.value).toEqual({ ...value, helpIntroSeen: false });
            expect(appSettingsSchema.parse(row?.value).helpIntroSeen).toBe(false);
          } else {
            expect(row).toBeUndefined();
          }
          expect((await upgraded.settings.get('other'))?.value).toEqual({ preserved: true });
        }
      } finally {
        old.close();
        upgraded.close();
        await Dexie.delete(name);
      }
    },
  );
});
