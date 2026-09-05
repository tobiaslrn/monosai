import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fixedClock } from '../../../domain/shared/clock';
import { createTestDatabase, destroyTestDatabase } from '../../../../testing/test-database';
import type { MonosaiDatabase } from '../monosai-db';
import { DexieCredentialRepository } from './dexie-credential.repository';

const SECRET = 'sk-or-v1-test-key-value';

describe('DexieCredentialRepository', () => {
  let db: MonosaiDatabase;
  let repository: DexieCredentialRepository;

  beforeEach(async () => {
    db = await createTestDatabase();
    repository = new DexieCredentialRepository(db, fixedClock(1_700_300_000_000));
  });

  afterEach(async () => {
    await destroyTestDatabase(db);
  });

  it('reports not configured before a key is saved', async () => {
    const status = await repository.getStatus();

    expect(status.ok && status.value.isConfigured).toBe(false);
    expect(status.ok && status.value.createdAt).toBeNull();
  });

  it('never returns the saved key from any status method', async () => {
    await repository.replace(SECRET);

    const status = await repository.getStatus();

    expect(status.ok).toBe(true);
    if (!status.ok) {
      return;
    }
    expect(status.value.isConfigured).toBe(true);
    expect(JSON.stringify(status.value)).not.toContain(SECRET);
    expect(Object.values(status.value)).not.toContain(SECRET);
  });

  it('exposes the key only inside a request callback', async () => {
    await repository.replace(SECRET);

    let observed: string | null = null;
    const used = await repository.useApiKey((apiKey) => {
      observed = apiKey;
      return Promise.resolve('sent');
    });

    expect(used.ok && used.value).toBe('sent');
    expect(observed).toBe(SECRET);
  });

  it('fails a request when no key is saved', async () => {
    const used = await repository.useApiKey(() => Promise.resolve('sent'));

    expect(used.ok).toBe(false);
    if (used.ok) {
      return;
    }
    expect(used.error.code).toBe('not-found');
  });

  it('keeps the original creation time when the key is replaced', async () => {
    const first = await repository.replace(SECRET);
    const replaced = await repository.replace('sk-or-v1-second-key');

    expect(first.ok && replaced.ok && replaced.value.createdAt).toBe(
      first.ok ? first.value.createdAt : null,
    );
  });

  it('rejects an empty key', async () => {
    const saved = await repository.replace('   ');

    expect(saved.ok).toBe(false);
    expect(await db.credentials.count()).toBe(0);
  });

  it('removes the key without touching other data', async () => {
    await repository.replace(SECRET);
    await db.settings.put({
      key: 'app',
      v: 1,
      value: { theme: 'dark', activeSnapshotId: null, updatedAt: 1 },
    });

    const removed = await repository.remove();

    expect(removed.ok && removed.value.isConfigured).toBe(false);
    expect(await db.credentials.count()).toBe(0);
    expect(await db.settings.count()).toBe(1);
  });

  it('keeps the credential in its own table, out of ordinary settings', async () => {
    await repository.replace(SECRET);

    const settingsRows = await db.settings.toArray();

    expect(JSON.stringify(settingsRows)).not.toContain(SECRET);
  });
});
