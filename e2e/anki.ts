import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page, type Route } from '@playwright/test';

const FIXTURE_DIR = join(process.cwd(), 'src', 'testing', 'fixtures', 'anki');

/** The addresses the connection adapters are allowed to reach. */
const CONNECT_ENDPOINTS = 'http://127.0.0.1:8765/**';
const CONNECT_ENDPOINTS_ALT = 'http://localhost:8765/**';

export function ankiFixture(name: string): Buffer {
  return readFileSync(join(FIXTURE_DIR, name));
}

/** Uploads one of the committed package fixtures through the real file input. */
export async function choosePackage(page: Page, name: string): Promise<void> {
  if ((await page.getByTestId('package-input').count()) === 0) {
    await page.getByTestId('add-source').click();
  }
  await page.getByTestId('package-input').setInputFiles({
    name,
    mimeType: 'application/octet-stream',
    buffer: ankiFixture(name),
  });
}

/**
 * Answers the local AnkiConnect endpoints with a scripted collection.
 *
 * The adapters only ever talk to these two fixed addresses, so intercepting
 * them is enough to exercise the whole connection path without anything
 * listening locally.
 */
export async function stubAnkiConnect(page: Page, answers: Record<string, unknown>): Promise<void> {
  const handler = async (route: Route): Promise<void> => {
    const body = route.request().postDataJSON() as { action?: string };
    const action = body.action ?? '';
    if (!(action in answers)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ result: null, error: 'unsupported action' }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ result: answers[action], error: null }),
    });
  };

  await page.route(CONNECT_ENDPOINTS, handler);
  await page.route(CONNECT_ENDPOINTS_ALT, handler);
}

/** Makes both local endpoints look like nothing is listening. */
export async function refuseAnkiConnect(page: Page): Promise<void> {
  await page.route(CONNECT_ENDPOINTS, (route) => route.abort('connectionrefused'));
  await page.route(CONNECT_ENDPOINTS_ALT, (route) => route.abort('connectionrefused'));
}

export async function openVocabulary(page: Page): Promise<void> {
  await page.goto('/#/vocabulary');
  await expect(page.getByRole('heading', { name: 'Vocabulary', level: 1 })).toBeVisible();
}

/** Reads the committed current vocabulary rows straight from IndexedDB. */
export async function readSnapshots(
  page: Page,
): Promise<readonly { id: string; uniqueEntryCount: number; sourceKinds?: readonly string[] }[]> {
  return page.evaluate(
    () =>
      new Promise<{ id: string; uniqueEntryCount: number; sourceKinds?: readonly string[] }[]>(
        (resolve, reject) => {
          const request = indexedDB.open('monosai');
          request.onerror = () => {
            reject(new Error('could not open the Monosai database'));
          };
          request.onsuccess = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains('vocabularySnapshots')) {
              db.close();
              resolve([]);
              return;
            }
            const read = db
              .transaction('vocabularySnapshots', 'readonly')
              .objectStore('vocabularySnapshots')
              .getAll();
            read.onsuccess = () => {
              db.close();
              resolve(
                read.result as {
                  id: string;
                  uniqueEntryCount: number;
                  sourceKinds?: readonly string[];
                }[],
              );
            };
            read.onerror = () => {
              db.close();
              reject(new Error('could not read the snapshots'));
            };
          };
        },
      ),
  );
}

/** Adds a package source and waits for its vocabulary to be applied. */
export async function connectPackage(page: Page, fixture: string): Promise<void> {
  await choosePackage(page, fixture);
  await expect(page.getByTestId('current-snapshot')).toContainText('unique expressions', {
    timeout: 60_000,
  });
}
