import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { configureTextModel, configureTts } from '../e2e/generation';
import { stubOpenRouter } from '../e2e/openrouter';

test.beforeEach(async ({ page }) => {
  await page.addLocatorHandler(
    page.getByRole('alertdialog', { name: 'Monosai is in alpha' }),
    async () => {
      await page.getByRole('button', { name: 'Continue' }).click();
    },
  );
  await page.addLocatorHandler(
    page.getByRole('dialog', { name: 'A little help getting started' }),
    async () => {
      await page.getByRole('button', { name: 'Dismiss' }).click();
    },
  );
});

const CONTRACT_PACKAGE = 'contract-schema18-zstd.apkg';

function ankiFixture(name: string): Buffer {
  return readFileSync(join(process.cwd(), 'src', 'testing', 'fixtures', 'anki', name));
}

/**
 * Posts a file to the share target the way Android's share sheet does.
 *
 * A real form submission from the controlled page, so the request goes through
 * the service worker and the browser follows its redirect — an API request
 * would bypass the worker entirely and prove nothing.
 */
async function shareFile(
  page: Page,
  name: string,
  bytes: Buffer,
  mimeType = 'application/apkg',
): Promise<void> {
  const navigated = page.waitForEvent('framenavigated', {
    predicate: (frame) => frame === page.mainFrame(),
  });
  await Promise.all([
    navigated,
    page.evaluate(
      ({ name: fileName, base64, mimeType: sharedMimeType }) => {
        const binary = atob(base64);
        const buffer = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) {
          buffer[index] = binary.charCodeAt(index);
        }
        const form = document.createElement('form');
        form.method = 'POST';
        form.enctype = 'multipart/form-data';
        form.action = new URL('share-target', document.baseURI).toString();
        const input = document.createElement('input');
        input.type = 'file';
        input.name = 'package';
        const transfer = new DataTransfer();
        transfer.items.add(new File([buffer], fileName, { type: sharedMimeType }));
        input.files = transfer.files;
        form.append(input);
        document.body.append(form);
        form.submit();
      },
      { name, base64: bytes.toString('base64'), mimeType },
    ),
  ]);
}

/** Confirms the chooser the contract package's two note types make necessary. */
async function confirmImport(page: Page): Promise<void> {
  const confirm = page.getByTestId('package-import-confirm');
  await expect(confirm).toBeVisible({ timeout: 120_000 });
  await confirm.click();
}

/** What is left in the worker's handover cache. */
async function sharedInboxEntries(page: Page): Promise<readonly string[]> {
  return page.evaluate(async () => {
    if (!(await caches.has('monosai-shared-inbox'))) {
      return [];
    }
    const cache = await caches.open('monosai-shared-inbox');
    return (await cache.keys()).map((request) => request.url);
  });
}

const SAMPLE_TEXT = '吾輩は猫である。名前はまだ無い。\n\nどこで生れたかとんと見当がつかぬ。';

/** Waits for the worker to be installed and controlling the current page. */
async function waitForServiceWorkerControl(page: Page): Promise<void> {
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, {
    timeout: 60_000,
  });
}

/** Resolves once every prefetched file of ngsw.json is cached; going offline earlier degrades the worker. */
async function waitForPrefetchComplete(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const manifest = (await (await fetch('ngsw.json')).json()) as {
            assetGroups: { installMode: string; urls: string[] }[];
          };
          const urls = manifest.assetGroups
            .filter((group) => group.installMode === 'prefetch')
            .flatMap((group) => group.urls);
          const cached = await Promise.all(
            urls.map((url) => caches.match(new URL(url, location.origin).toString())),
          );
          return cached.filter((response) => response === undefined).length;
        }),
      { timeout: 120_000 },
    )
    .toBe(0);
}

interface WebAppManifestIcon {
  readonly src: string;
}

interface ShareTargetFile {
  readonly name: string;
  readonly accept: readonly string[];
}

interface WebAppManifest {
  readonly share_target?: {
    readonly action: string;
    readonly method: string;
    readonly enctype: string;
    readonly params: { readonly files?: readonly ShareTargetFile[] };
  };
  readonly name: string;
  readonly short_name: string;
  readonly display: string;
  readonly start_url: string;
  readonly scope: string;
  readonly icons: readonly WebAppManifestIcon[];
}

async function importReading(page: Page): Promise<void> {
  await page.goto('./#/add');
  await page.getByRole('textbox', { name: 'Japanese text' }).fill(SAMPLE_TEXT);
  const addReading = page.getByRole('button', { name: 'Add story' });
  await expect(addReading).toBeEnabled({
    timeout: 60_000,
  });
  await addReading.click();
  await expect(page).toHaveURL(/#\/reader\//);
  await expect(page.locator('mn-reader-paragraph').first()).toBeVisible();
}

test.describe('installability', () => {
  test('the manifest fetches, parses, and every declared icon resolves', async ({
    page,
    baseURL,
  }) => {
    await page.goto('./');
    const response = await page.request.get(new URL('manifest.webmanifest', baseURL).toString());
    expect(response.ok()).toBe(true);
    const manifest = (await response.json()) as WebAppManifest;

    expect(manifest.name).toBe('Monosai');
    expect(manifest.short_name).toBe('Monosai');
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('./');
    expect(manifest.scope).toBe('./');
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons.length).toBeGreaterThanOrEqual(3);

    for (const icon of manifest.icons) {
      const iconUrl = new URL(icon.src, new URL('manifest.webmanifest', baseURL)).toString();
      const iconResponse = await page.request.get(iconUrl);
      expect(iconResponse.ok(), `icon ${icon.src} should fetch`).toBe(true);
    }
  });

  test('the manifest link and icons resolve inside the /monosai/ base path', async ({ page }) => {
    await page.goto('./');
    const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(manifestHref).toBe('manifest.webmanifest');

    for (const selector of ['link[rel="icon"]', 'link[rel="apple-touch-icon"]']) {
      const href = await page.locator(selector).first().getAttribute('href');
      expect(href, `${selector} should declare an href`).toBeTruthy();
      const response = await page.request.get(new URL(href!, page.url()).toString());
      expect(response.ok(), `${selector} ${href} should fetch`).toBe(true);
    }

    const baseHref = await page.locator('base').getAttribute('href');
    expect(baseHref).toBe('/monosai/');
  });
});

test.describe('base path', () => {
  test('no same-origin request during the initial load escapes /monosai/', async ({ page }) => {
    const escaped: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.origin === new URL(page.url()).origin && !url.pathname.startsWith('/monosai/')) {
        escaped.push(url.pathname);
      }
    });

    await page.goto('./');
    await expect(page.getByRole('main')).toBeVisible();

    expect(escaped).toEqual([]);
  });
});

test.describe('diagnostics', () => {
  test('copies redacted diagnostics without exposing sensitive values', async ({ page }) => {
    const sensitiveValues = ['sk-test-secret-api-key', 'private reading text'];
    const consoleMessages: string[] = [];
    page.on('console', (message) => consoleMessages.push(message.text()));

    await page.goto('./#/settings');

    const diagnostics = page.getByRole('region', { name: 'About' });
    await expect(diagnostics.getByRole('button', { name: 'Copy diagnostics' })).toBeVisible();
    await diagnostics.getByRole('button', { name: 'Copy diagnostics' }).click();
    await expect(diagnostics.getByRole('status')).toHaveText(/^(Copied|Could not copy)$/);

    const pageText = await page.locator('body').innerText();
    for (const sensitiveValue of sensitiveValues) {
      expect(pageText).not.toContain(sensitiveValue);
      expect(consoleMessages.some((message) => message.includes(sensitiveValue))).toBe(false);
    }

    expect(
      consoleMessages.some(
        (message) =>
          message.includes('[Monosai] diagnostics.copy.succeeded') ||
          message.includes('[Monosai] diagnostics.copy.failed'),
      ),
    ).toBe(true);
  });
});

test.describe('offline reload', () => {
  test('a saved reading opens offline after the worker has taken control', async ({
    page,
    context,
  }) => {
    await page.goto('./');
    await waitForServiceWorkerControl(page);

    await importReading(page);
    const readerUrl = page.url();

    await context.setOffline(true);

    await page.goto(readerUrl);
    await expect(page.locator('mn-reader-paragraph').first()).toBeVisible({ timeout: 15_000 });

    await page.goto(new URL('#/library', readerUrl).toString());
    await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: /吾輩は猫である/ })).toBeVisible();

    await context.setOffline(false);
  });

  test('the start URL reloads offline from the cached shell', async ({ page, context }) => {
    test.setTimeout(180_000);
    await page.goto('./#/library');
    await waitForServiceWorkerControl(page);
    await waitForPrefetchComplete(page);
    await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible();

    await context.setOffline(true);

    const root = await page.goto('./');
    expect(root?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible();

    await context.setOffline(false);
  });
});

/**
 * A string only the speech synthesizer contains.
 *
 * An error message survives minification and, unlike a task name, an endpoint or
 * a MIME type, is not shared with the settings test or the encoder. If the
 * message is reworded this stops matching and the test says so.
 */
const SPEECH_CHUNK_MARKER = 'Unreachable TTS capability fallback state.';

/**
 * The file name of the lazy chunk that holds the speech synthesizer.
 *
 * Found by content in the served build, because the hash changes with every
 * build and CI hands this suite only the browser output.
 */
function speechChunkName(): string {
  const directory = join(process.cwd(), 'dist', 'monosai', 'browser');
  const holders = readdirSync(directory).filter(
    (file) =>
      file.startsWith('chunk-') &&
      file.endsWith('.js') &&
      readFileSync(join(directory, file), 'utf8').includes(SPEECH_CHUNK_MARKER),
  );
  expect(holders, 'exactly one chunk holds the speech synthesizer').toHaveLength(1);
  return holders[0]!;
}

test.describe('speech code that cannot be loaded', () => {
  test('a run ends stopped, not hung, when the worker no longer holds the speech chunk', async ({
    page,
    context,
  }) => {
    test.setTimeout(240_000);
    const chunk = speechChunkName();
    // Routed on the context: a page route does not see requests while a worker
    // controls the page.
    const calls = await stubOpenRouter({
      route: (...args: Parameters<Page['route']>) => context.route(...args),
    } as Page);

    await page.goto('./');
    await waitForServiceWorkerControl(page);
    await waitForPrefetchComplete(page);
    // Nothing may have synthesized yet: a chunk that has loaded once stays in
    // memory, and then removing it from the cache proves nothing.
    await configureTextModel(page);
    await configureTts(page);
    await importReading(page);
    await page
      .locator('.bar-actions')
      .getByRole('button', { name: /^Audio/ })
      .click();
    const player = page.getByRole('region', { name: 'Story audio' });
    await expect(player).toBeVisible();

    const removed = await page.evaluate(async (name) => {
      let count = 0;
      for (const cacheName of await caches.keys()) {
        const cache = await caches.open(cacheName);
        for (const request of await cache.keys()) {
          if (new URL(request.url).pathname.endsWith(`/${name}`)) {
            await cache.delete(request);
            count += 1;
          }
        }
      }
      return count;
    }, chunk);
    expect(removed, 'the speech chunk was in the worker cache').toBeGreaterThan(0);

    const synthesisBefore = calls.urls.filter((url) => url.includes('/audio/speech')).length;
    const chunkFailures: string[] = [];
    page.on('requestfailed', (request) => {
      if (request.url().endsWith(`/${chunk}`)) {
        chunkFailures.push(request.url());
      }
    });
    await context.setOffline(true);
    await player.getByRole('button', { name: 'Generate audio' }).click();

    // The run is over: it says so, nothing is still being generated, and the
    // learner is offered another go.
    await expect(player.locator('[role="status"]')).toContainText('Stopped. 0 of 3 sentences', {
      timeout: 30_000,
    });
    // Offline is the true cause, so the offline wording is the right one.
    await expect(player).toContainText('Offline');
    await expect(player.getByRole('button', { name: 'Stop generating audio' })).toHaveCount(0);
    await expect(player.getByRole('button', { name: 'Try again' })).toBeVisible();
    expect(chunkFailures, 'the chunk was asked for and could not be had').toHaveLength(1);
    expect(
      calls.urls.filter((url) => url.includes('/audio/speech')).length,
      'the run never reached the provider',
    ).toBe(synthesisBefore);

    // Back online the worker fetches the chunk again and the run completes.
    await context.setOffline(false);
    await player.getByRole('button', { name: 'Try again' }).click();
    await expect(player.locator('[role="status"]')).toHaveText('3 sentences ready', {
      timeout: 60_000,
    });
  });
});

test.describe('Android share target', () => {
  test('the manifest declares a file share target for Anki packages', async ({ page, baseURL }) => {
    await page.goto('./');
    const response = await page.request.get(new URL('manifest.webmanifest', baseURL).toString());
    const manifest = (await response.json()) as WebAppManifest;
    const shareTarget = manifest.share_target;

    expect(shareTarget).toBeDefined();
    expect(shareTarget?.method).toBe('POST');
    expect(shareTarget?.enctype).toBe('multipart/form-data');
    // Relative, so the target stays inside the deployed base path.
    expect(shareTarget?.action).toBe('share-target');

    const files = shareTarget?.params.files ?? [];
    expect(files).toHaveLength(1);
    expect(files[0]!.name).toBe('package');
    // Android matches the share sheet by MIME type, and knows no mapping for
    // `.apkg`, so the types AnkiDroid shares with have to be listed too.
    expect(files[0]!.accept).toEqual(
      expect.arrayContaining([
        'application/zip',
        'application/octet-stream',
        'application/apkg',
        'application/colpkg',
        'application/vnd.anki',
        'application/x-apkg',
        'application/x-colpkg',
        '.apkg',
        '.colpkg',
      ]),
    );
  });

  test('a shared package is imported, and a later share works offline', async ({
    page,
    context,
  }) => {
    test.setTimeout(300_000);
    await page.goto('./');
    await waitForServiceWorkerControl(page);

    await shareFile(page, CONTRACT_PACKAGE, ankiFixture(CONTRACT_PACKAGE));

    await expect(page).toHaveURL(/#\/reading-level/, { timeout: 60_000 });
    // The marker is removed as soon as it is acted on, so a reload cannot
    // replay the share.
    await expect(page).not.toHaveURL(/shared=/, { timeout: 60_000 });

    await confirmImport(page);
    await expect(page.getByTestId('package-import-complete')).toContainText('Added Core Japanese', {
      timeout: 120_000,
    });
    await expect(page.getByTestId('words-standing')).toContainText('words');
    // Nothing is left behind in the handover cache.
    expect(await sharedInboxEntries(page)).toEqual([]);

    // The parser, the tokenizer, and the app shell are all cached now, so the
    // same deck shared again needs no network at all — and replaces its source
    // rather than adding a second one.
    await context.setOffline(true);
    await shareFile(page, CONTRACT_PACKAGE, ankiFixture(CONTRACT_PACKAGE));
    await expect(page).toHaveURL(/#\/reading-level/, { timeout: 60_000 });
    // The first import settled the mapping, so an exact-name re-import can use
    // that note type and field without asking again.
    const importState = page.locator('[data-testid^="package-import-"]');
    await expect(importState).toBeVisible({ timeout: 120_000 });
    await expect(importState).toHaveAttribute('data-testid', 'package-import-complete');
    await expect(importState).toContainText('Replaced Core Japanese');
    await expect(page.getByTestId('source-row')).toHaveCount(1);

    await context.setOffline(false);
  });

  test('a shared file that is not a package is refused with an explanation', async ({ page }) => {
    await page.goto('./');
    await waitForServiceWorkerControl(page);

    await shareFile(page, 'holiday.jpg', Buffer.from('not a package'), 'image/jpeg');

    await expect(page.getByTestId('package-import-failed')).toContainText('not an Anki package', {
      timeout: 30_000,
    });
    expect(await sharedInboxEntries(page)).toEqual([]);
  });
});

test.describe('a tab that lost its database, under a live worker', () => {
  test('the notice survives the update checks that run when the tab is revisited', async ({
    page,
    context,
  }) => {
    await page.goto('./');
    await waitForServiceWorkerControl(page);
    await page.reload();
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible();

    const other = await context.newPage();
    await other.goto('./#/library');
    await other.evaluate(
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
              request.result.createObjectStore('futureStore', { keyPath: 'id' });
            };
            request.onerror = () => {
              reject(new Error('could not upgrade'));
            };
            request.onsuccess = () => {
              request.result.close();
              resolve();
            };
          };
        }),
    );

    const notice = page.getByRole('alert').filter({ hasText: 'can no longer save' });
    await expect(notice).toBeVisible();
    await page.evaluate(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    // The check reaches the live worker and answers that nothing is newer.
    // eslint-disable-next-line no-restricted-syntax -- an absence only shows over elapsed time
    await page.waitForTimeout(3000);
    await expect(notice).toBeVisible();
    await expect(page.getByText('Up to date')).toHaveCount(0);
  });
});
