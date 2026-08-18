import { expect, test, type Page } from '@playwright/test';
import { readSettingsRecord } from './storage';

const BUNDLE_PREFIX = '/assets/language/1/';

function statusOf(page: Page) {
  return page.getByTestId('language-status');
}

function expectPrepared(page: Page) {
  return expect(statusOf(page)).toContainText('Ready:', { timeout: 120_000 });
}

test.describe('offline language assets', () => {
  test('prepares, verifies, and activates the bundle without being asked', async ({ page }) => {
    await page.goto('/#/settings');

    await expectPrepared(page);

    const versions = page.getByTestId('language-versions');
    await expect(versions).toContainText('Tokenizer');
    await expect(versions).toContainText('Structural baseline');

    const record = (await readSettingsRecord(page, 'language-assets')) as {
      value?: { tokenizerVersion?: string; dictionaryVersion?: string };
    } | null;
    expect(record?.value?.tokenizerVersion).toBeTruthy();
    expect(record?.value?.dictionaryVersion).toBeTruthy();

    await expect(page.getByTestId('language-attributions')).toContainText('JMdict');
    await expect(page.getByTestId('language-attributions')).toContainText('IPADIC');
  });

  test('renders and navigates while the bundle is still downloading', async ({ page }) => {
    // Hold the largest asset open so preparation cannot finish during the test.
    await page.route(`**${BUNDLE_PREFIX}tokenizer/*`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      await route.abort();
    });

    await page.goto('/#/settings');

    // The shell is interactive and the route renders even though the language
    // bundle is still in flight.
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Dark' })).toBeEnabled();
    await page.getByRole('radio', { name: 'Dark' }).check();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('initializes from the cache when the network is unavailable', async ({ page }) => {
    await page.goto('/#/settings');
    await expectPrepared(page);

    // Every request for a bundle file now fails. Initialization must still
    // succeed from the verified Cache Storage copy. The application shell itself
    // is still served by the development server, because its offline fallback is
    // service-worker work that a later milestone delivers.
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
    expect(cached).toContain('/assets/language/1/dictionary.json');
    expect(cached).toContain('/assets/language/1/tokenizer/lindera_wasm_bg.wasm');
    expect(blocked).toEqual([]);
  });

  test('reports a typed error instead of crashing when an asset is corrupted', async ({ page }) => {
    await page.route(`**${BUNDLE_PREFIX}structural-baseline.json`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"schemaVersion":1,"entries":[]}',
      }),
    );

    await page.goto('/#/settings');

    const failure = page.getByTestId('language-error');
    await expect(failure).toBeVisible({ timeout: 120_000 });
    await expect(failure).toContainText('integrity');
    await expect(failure).toContainText('language/asset-integrity-mismatch');

    // The app is still usable and nothing was activated.
    await expect(page.getByTestId('language-versions')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
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

    await page.goto('/#/settings');
    await expect(page.getByTestId('language-error')).toBeVisible({ timeout: 120_000 });

    corrupt = false;
    await page.getByTestId('language-retry').click();
    await expectPrepared(page);
  });
});
