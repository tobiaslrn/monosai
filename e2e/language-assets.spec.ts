import { expect, test, type Page } from '@playwright/test';
import { readSettingsRecord } from './storage';

const BUNDLE_PREFIX = '/assets/language/1/';
/**
 * The same files as they are actually cached: the suite serves the production
 * build from `/monosai/`, so every cache key carries that base path. Route
 * globs below stay base-relative because they are matched with a `**` prefix.
 */
const CACHED_BUNDLE_PREFIX = `/monosai${BUNDLE_PREFIX}`;

interface LanguageAssetsRecord {
  readonly value?: {
    readonly tokenizerVersion?: string;
    readonly dictionaryVersion?: string;
  };
}

async function languageAssetsRecord(page: Page): Promise<LanguageAssetsRecord | null> {
  return (await readSettingsRecord(page, 'language-assets')) as LanguageAssetsRecord | null;
}

async function expectPrepared(page: Page): Promise<LanguageAssetsRecord> {
  await expect
    .poll(
      async () => {
        const record = await languageAssetsRecord(page);
        return Boolean(record?.value?.tokenizerVersion && record.value.dictionaryVersion);
      },
      { timeout: 120_000 },
    )
    .toBe(true);

  return (await languageAssetsRecord(page)) ?? {};
}

test.describe('offline language assets', () => {
  test('prepares, verifies, and activates the bundle without being asked @smoke', async ({
    page,
  }) => {
    await page.goto('./#/settings');

    const record = await expectPrepared(page);
    expect(record.value?.tokenizerVersion).toBeTruthy();
    expect(record.value?.dictionaryVersion).toBeTruthy();

    await page.getByText('Advanced technical details').click();
    await expect(page.getByText('Language support')).toHaveCount(0);
  });

  test('renders and navigates while the bundle is still downloading', async ({ page }) => {
    let releaseDownload: () => void = () => undefined;
    const downloadGate = new Promise<void>((resolve) => {
      releaseDownload = resolve;
    });

    // Hold the largest asset open so preparation cannot finish during the test.
    await page.route(`**${BUNDLE_PREFIX}tokenizer/*`, async (route) => {
      await downloadGate;
      await route.abort();
    });

    try {
      await page.goto('./#/settings');

      // The shell is interactive and the route renders even though the language
      // bundle is still in flight.
      await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByRole('radio', { name: 'Dark' })).toBeEnabled();
      await page.getByRole('radio', { name: 'Dark' }).check();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    } finally {
      releaseDownload();
    }
  });

  test('initializes from the cache when the network is unavailable', async ({ page }) => {
    await page.goto('./#/settings');
    await expectPrepared(page);

    // Every request for a bundle file now fails. Initialization must still
    // succeed from the verified Cache Storage copy. The application shell itself
    // is still served normally: this suite blocks the service worker, so shell
    // offline behavior belongs to the `e2e:pwa` suite rather than here.
    const blocked: string[] = [];
    await page.route(`**${BUNDLE_PREFIX}*`, (route) => {
      blocked.push(route.request().url());
      return route.abort();
    });

    await page.reload();
    await expectPrepared(page);

    const cached = await page.evaluate(async () => {
      const cache = await caches.open('monosai-language-1');
      return (await cache.keys()).map((request) => new URL(request.url).pathname);
    });
    expect(cached).toContain(`${CACHED_BUNDLE_PREFIX}dictionary.json`);
    expect(cached).toContain(`${CACHED_BUNDLE_PREFIX}tokenizer/lindera_wasm_bg.wasm`);
    expect(blocked).toEqual([]);
  });

  test('reports a typed error instead of crashing when an asset is corrupted @smoke', async ({
    page,
  }) => {
    await page.route(`**${BUNDLE_PREFIX}structural-baseline.json`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"schemaVersion":1,"entries":[]}',
      }),
    );

    await page.goto('./#/reading-level');

    const failure = page.getByRole('heading', { name: 'Language assets are unavailable' });
    await expect(failure).toBeVisible({ timeout: 120_000 });

    // The feature-level recovery remains actionable even though Settings no
    // longer exposes implementation details.
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
    expect(await languageAssetsRecord(page)).toBeNull();
  });

  test('recovers when the corrupted asset is served correctly again', async ({ page }) => {
    let corrupt = true;
    await page.route(`**${BUNDLE_PREFIX}structural-baseline.json`, async (route) => {
      if (corrupt) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: '{"schemaVersion":1,"entries":[]}',
        });
        return;
      }
      await route.fallback();
    });

    await page.goto('./#/reading-level');
    await expect(
      page.getByRole('heading', { name: 'Language assets are unavailable' }),
    ).toBeVisible({ timeout: 120_000 });

    corrupt = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expectPrepared(page);
    await expect(page.getByRole('radiogroup', { name: 'Reading level' })).toBeVisible();
  });
});
