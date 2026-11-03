import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test.use({ storageState: { cookies: [], origins: [] } });

const API_KEY = 'sk-or-startup-recovery-secret';

/**
 * Leaves a real, populated database whose app settings no longer validate. The
 * failure screen appears on the next load, with every other row still stored.
 */
async function corruptStoredSettings(page: Page): Promise<void> {
  await page.goto('./');
  await expect(page.getByRole('alertdialog', { name: 'Monosai is in alpha.' })).toBeVisible();
  await page.evaluate(
    (apiKey) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('monosai');
        request.onerror = () => {
          reject(new Error('could not open the Monosai database'));
        };
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(['settings', 'credentials'], 'readwrite');
          transaction
            .objectStore('settings')
            .put({ key: 'app', v: 1, value: { theme: 'not a theme' } });
          transaction
            .objectStore('credentials')
            .put({ key: 'openrouter', v: 1, apiKey, createdAt: 1, updatedAt: 1 });
          transaction.oncomplete = () => {
            db.close();
            resolve();
          };
          transaction.onerror = () => {
            reject(new Error('could not write the seed rows'));
          };
        };
      }),
    API_KEY,
  );
  await page.reload();
}

interface NativeState {
  readonly version: number;
  readonly stores: string[];
  readonly futureRows: unknown[];
}

/** The database as the browser holds it, read without Dexie and without a version. */
function nativeState(page: Page): Promise<NativeState> {
  return page.evaluate(
    () =>
      new Promise<NativeState>((resolve, reject) => {
        const request = indexedDB.open('monosai');
        request.onerror = () => {
          reject(new Error('could not read the database'));
        };
        request.onsuccess = () => {
          const db = request.result;
          const stores = Array.from(db.objectStoreNames).sort();
          const finish = (futureRows: unknown[]) => {
            const state = { version: db.version, stores, futureRows };
            db.close();
            resolve(state);
          };
          if (!stores.includes('futureStore')) {
            finish([]);
            return;
          }
          const read = db.transaction('futureStore').objectStore('futureStore').getAll();
          read.onsuccess = () => {
            finish(read.result as unknown[]);
          };
        };
      }),
  );
}

function recoveryPanel(page: Page): Locator {
  return page.getByRole('alert').filter({ hasText: 'Monosai could not start' });
}

test.describe('startup recovery', () => {
  test('saves a copy without the API key, and deletes only when confirmed @smoke @mobile', async ({
    page,
  }) => {
    await corruptStoredSettings(page);
    const panel = recoveryPanel(page);
    await expect(panel).toContainText('A stored record could not be read.');
    await expect(panel).not.toContainText('step:');

    const download = page.waitForEvent('download');
    await panel.getByRole('button', { name: 'Save a copy of my data' }).click();
    const text = await readFile(await (await download).path(), 'utf8');
    expect(text).not.toContain(API_KEY);
    const copy = JSON.parse(text) as { tables: Record<string, unknown[]> };
    expect(copy.tables['settings']).toContainEqual({
      key: 'app',
      v: 1,
      value: { theme: 'not a theme' },
    });
    expect(Object.keys(copy.tables)).not.toContain('credentials');

    await panel.getByRole('button', { name: 'Delete all Monosai data' }).click();
    const confirm = page.getByRole('alertdialog', { name: 'Delete all Monosai data?' });
    await expect(confirm).toContainText('API key');
    await confirm.getByRole('button', { name: 'Keep my data' }).click();
    await expect(confirm).toHaveCount(0);
    await page.reload();
    await expect(recoveryPanel(page)).toBeVisible();

    await recoveryPanel(page).getByRole('button', { name: 'Delete all Monosai data' }).click();
    await confirm.getByRole('button', { name: 'Delete everything' }).click();
    await expect(page.getByRole('alertdialog', { name: 'Monosai is in alpha.' })).toBeVisible();
    await expect(recoveryPanel(page)).toHaveCount(0);
  });

  test('offers recovery when an upgrade rejects a stored row, keeping the row @smoke @mobile', async ({
    page,
  }) => {
    await page.goto('./');
    await expect(page.getByRole('alertdialog', { name: 'Monosai is in alpha.' })).toBeVisible();
    await page.addInitScript(() => {
      if (sessionStorage.getItem('seeded') !== null) {
        return;
      }
      sessionStorage.setItem('seeded', 'yes');
      indexedDB.deleteDatabase('monosai');
      const request = indexedDB.open('monosai', 170);
      request.onupgradeneeded = () => {
        request.result
          .createObjectStore('settings', { keyPath: 'key' })
          .put({ key: 'app', v: 1, value: 'not an object' });
      };
      request.onsuccess = () => {
        request.result.close();
      };
    });
    await page.reload();

    const panel = recoveryPanel(page);
    await expect(panel).toContainText('The stored database could not be upgraded.');
    await expect(panel.getByRole('button', { name: 'Delete all Monosai data' })).toBeVisible();

    const download = page.waitForEvent('download');
    await panel.getByRole('button', { name: 'Save a copy of my data' }).click();
    const copy = JSON.parse(await readFile(await (await download).path(), 'utf8')) as {
      tables: Record<string, unknown[]>;
    };
    expect(copy.tables['settings']).toContainEqual({ key: 'app', v: 1, value: 'not an object' });

    await panel.getByRole('button', { name: 'Delete all Monosai data' }).click();
    await page.getByRole('button', { name: 'Delete everything' }).click();
    await expect(page.getByRole('alertdialog', { name: 'Monosai is in alpha.' })).toBeVisible();
  });

  test('refuses a database from a newer build without changing it @smoke @mobile', async ({
    page,
  }) => {
    await page.goto('./');
    await expect(page.getByRole('alertdialog', { name: 'Monosai is in alpha.' })).toBeVisible();
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const current = indexedDB.open('monosai');
          current.onerror = () => {
            reject(new Error('could not read the version'));
          };
          current.onsuccess = () => {
            const version = current.result.version + 10;
            current.result.close();
            const request = indexedDB.open('monosai', version);
            request.onupgradeneeded = () => {
              request.result.createObjectStore('futureStore', { keyPath: 'id' }).put({ id: 'a' });
              request.transaction?.db.deleteObjectStore('readings');
            };
            request.onerror = () => {
              reject(new Error('could not seed the newer version'));
            };
            request.onsuccess = () => {
              request.result.close();
              resolve();
            };
          };
        }),
    );
    const seeded = await nativeState(page);
    expect(seeded.stores).toContain('futureStore');
    expect(seeded.stores).not.toContain('readings');
    expect(seeded.futureRows).toEqual([{ id: 'a' }]);
    await page.reload();

    const panel = recoveryPanel(page);
    await expect(panel).toContainText('comes from a newer version of Monosai');
    await expect(panel.getByRole('button', { name: 'Try again' })).toHaveCount(0);
    await expect(panel.getByRole('button', { name: 'Reload' })).toBeVisible();
    expect(await nativeState(page)).toEqual(seeded);

    const download = page.waitForEvent('download');
    await panel.getByRole('button', { name: 'Save a copy of my data' }).click();
    const copy = JSON.parse(await readFile(await (await download).path(), 'utf8')) as {
      tables: Record<string, unknown[]>;
    };
    expect(copy.tables['futureStore']).toEqual([{ id: 'a' }]);
    expect(await nativeState(page)).toEqual(seeded);

    await panel.getByRole('button', { name: 'Delete all Monosai data' }).click();
    const confirm = page.getByRole('alertdialog', { name: 'Delete all Monosai data?' });
    await confirm.getByRole('button', { name: 'Keep my data' }).click();
    await expect(confirm).toHaveCount(0);
    expect(await nativeState(page)).toEqual(seeded);

    await page.evaluate(() => {
      (window as unknown as { loadedBefore: boolean }).loadedBefore = true;
    });
    await panel.getByRole('button', { name: 'Reload' }).click();
    await expect
      .poll(
        () => page.evaluate(() => (window as unknown as { loadedBefore?: boolean }).loadedBefore),
        { timeout: 15_000 },
      )
      .toBeUndefined();
    await expect(recoveryPanel(page)).toBeVisible();
    expect(await nativeState(page)).toEqual(seeded);
  });

  test('keeps a side gutter around the failure card @smoke @mobile', async ({ page }) => {
    await corruptStoredSettings(page);
    const panel = recoveryPanel(page);
    await expect(panel).toBeVisible();
    const box = await panel.boundingBox();
    const width = page.viewportSize()?.width ?? 0;
    expect(box?.x).toBeGreaterThan(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThan(width);
  });
});
