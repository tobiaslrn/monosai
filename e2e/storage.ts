import { expect, type Page } from '@playwright/test';

/** Reads one Monosai settings record straight from IndexedDB. */
export async function readSettingsRecord(page: Page, key: string): Promise<unknown> {
  return page.evaluate(
    (settingsKey) =>
      new Promise<unknown>((resolve, reject) => {
        const request = indexedDB.open('monosai');
        request.onerror = () => {
          reject(new Error('could not open the Monosai database'));
        };
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('settings')) {
            db.close();
            resolve(null);
            return;
          }
          const read = db
            .transaction('settings', 'readonly')
            .objectStore('settings')
            .get(settingsKey);
          read.onsuccess = () => {
            db.close();
            resolve(read.result ?? null);
          };
          read.onerror = () => {
            db.close();
            reject(new Error('could not read the settings record'));
          };
        };
      }),
    key,
  );
}

/** Waits until a settings value has actually been committed to storage. */
export async function expectSettingPersisted(
  page: Page,
  key: string,
  field: string,
  value: unknown,
): Promise<void> {
  await expect
    .poll(async () => {
      const record = await readSettingsRecord(page, key);
      if (record === null || typeof record !== 'object') {
        return undefined;
      }
      const stored = (record as { value?: Record<string, unknown> }).value;
      return stored?.[field];
    })
    .toBe(value);
}

export async function monosaiDatabaseExists(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    const databases = await indexedDB.databases();
    return databases.some((entry) => entry.name === 'monosai');
  });
}
