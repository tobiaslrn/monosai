import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

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
async function shareFile(page: Page, name: string, bytes: Buffer): Promise<void> {
  const navigated = page.waitForEvent('framenavigated', {
    predicate: (frame) => frame === page.mainFrame(),
  });
  await Promise.all([
    navigated,
    page.evaluate(
      ({ name: fileName, base64 }) => {
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
        transfer.items.add(new File([buffer], fileName, { type: 'application/octet-stream' }));
        input.files = transfer.files;
        form.append(input);
        document.body.append(form);
        form.submit();
      },
      { name, base64: bytes.toString('base64') },
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
  await page.getByLabel('Japanese text').fill(SAMPLE_TEXT);
  const addReading = page.getByRole('button', { name: 'Add reading' });
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

    const diagnostics = page.getByRole('region', { name: 'Troubleshooting' });
    await expect(diagnostics.getByRole('button', { name: 'Copy diagnostics' })).toBeVisible();
    await diagnostics.getByRole('button', { name: 'Copy diagnostics' }).click();
    await expect(diagnostics.getByRole('status')).toHaveText(
      /Diagnostics (copied|could not be copied on this browser)\./,
    );

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
    expect(files[0].name).toBe('package');
    // Android matches the share sheet by MIME type, and knows no mapping for
    // `.apkg`, so the types AnkiDroid shares with have to be listed too.
    expect(files[0].accept).toEqual(
      expect.arrayContaining(['application/zip', 'application/octet-stream', '.apkg']),
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

    await expect(page).toHaveURL(/#\/vocabulary/, { timeout: 60_000 });
    // The marker is removed as soon as it is acted on, so a reload cannot
    // replay the share.
    await expect(page).not.toHaveURL(/shared=/, { timeout: 60_000 });

    await confirmImport(page);
    await expect(page.getByTestId('package-import-complete')).toContainText('Added Core Japanese', {
      timeout: 120_000,
    });
    await expect(page.getByTestId('current-snapshot')).toContainText('unique expressions');
    // Nothing is left behind in the handover cache.
    expect(await sharedInboxEntries(page)).toEqual([]);

    // The parser, the tokenizer, and the app shell are all cached now, so the
    // same deck shared again needs no network at all — and replaces its source
    // rather than adding a second one.
    await context.setOffline(true);
    await shareFile(page, CONTRACT_PACKAGE, ankiFixture(CONTRACT_PACKAGE));
    await expect(page).toHaveURL(/#\/vocabulary/, { timeout: 60_000 });
    // The first import settled the mapping, so an exact-name re-import can use
    // that note type and field without asking again.
    const importState = page.locator('[data-testid^="package-import-"]');
    await expect(importState).toBeVisible({ timeout: 120_000 });
    await expect(importState).toHaveAttribute('data-testid', 'package-import-complete');
    await expect(importState).toContainText('Replaced Core Japanese');
    await expect(page.locator('li.source')).toHaveCount(1);

    await context.setOffline(false);
  });

  test('a shared file that is not a package is refused with an explanation', async ({ page }) => {
    await page.goto('./');
    await waitForServiceWorkerControl(page);

    await shareFile(page, 'holiday.jpg', Buffer.from('not a package'));

    await expect(page.getByTestId('package-import-failed')).toContainText('not an Anki package', {
      timeout: 30_000,
    });
    expect(await sharedInboxEntries(page)).toEqual([]);
  });
});
