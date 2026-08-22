import { expect, test, type Page } from '@playwright/test';

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

interface WebAppManifest {
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
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('button', { name: 'Save reading' })).toBeEnabled({
    timeout: 60_000,
  });
  await page.getByRole('button', { name: 'Save reading' }).click();
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
