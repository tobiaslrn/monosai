import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
const state = JSON.parse(await fs.readFile('.home-review-state.json', 'utf8'));
const base = process.env.HOME_REVIEW_URL ?? 'http://localhost:4200/';
state.origins[0].origin = new URL(base).origin;
const stores = state.origins[0].indexedDB[0].stores;
stores.find((s) => s.name === 'grammarProfile').records = [
  {
    value: {
      v: 1,
      key: 'profile',
      presetId: 'mn-preset-basic',
      registerPreference: 'either',
      updatedAt: Date.now(),
    },
  },
];
stores
  .find((s) => s.name === 'settings')
  .records.find((r) => r.value.key === 'app').value.value.activeSnapshotId =
  '9c55bd81-93d0-40e8-bc84-35249dbaf934';
stores.find((s) => s.name === 'vocabularySnapshots').records = [
  {
    value: {
      v: 1,
      id: '9c55bd81-93d0-40e8-bc84-35249dbaf934',
      createdAt: Date.now(),
      status: 'complete',
      uniqueEntryCount: 340,
      sourceIds: [],
      sourceKinds: ['text-list'],
      analyzerVersion: '1',
      normalizationVersion: '1',
      stats: {
        sourcesQueried: 1,
        entriesRead: 340,
        nonEmptyValues: 340,
        rejectedEmptyValues: 0,
        duplicateOccurrences: 0,
        uniqueExpressions: 340,
        sourceWarnings: [],
      },
    },
  },
];
const browser = await chromium.launch();
for (const theme of ['light', 'dark']) {
  for (const [name, width, height] of [
    ['mobile', 393, 851],
    ['desktop', 1440, 900],
  ]) {
    const context = await browser.newContext({
      storageState: state,
      viewport: { width, height },
      colorScheme: theme,
      serviceWorkers: 'block',
    });
    const page = await context.newPage();
    await page.goto(`${base}#/library`);
    await page.getByRole('link', { name: 'A New Bicycle', exact: true }).click();
    await expect(page.locator('mn-reader-paragraph').first()).toBeVisible({ timeout: 60000 });
    await page.getByRole('link', { name: 'Back to library', exact: true }).click();
    await expect(page.locator('mn-reading-card')).toHaveCount(8);
    await page.goto(`${base}#/home`);
    await expect(page.getByTestId('home-standing')).toContainText('You know 340 words');
    await expect(page.getByTestId('home-standing')).toContainText('at a basic level', {
      timeout: 60000,
    });
    await page.locator('.hero-art img').evaluate((img) => img.decode());
    await page.mouse.move(0, 0);
    await page.screenshot({ path: `../.home-${name}-${theme}.png`, fullPage: true });
    console.log(
      name,
      theme,
      await page.getByTestId('home-standing').innerText(),
      await page.evaluate(() => ({
        width: innerWidth,
        scroll: document.documentElement.scrollWidth,
      })),
    );
    await context.close();
  }
}
await browser.close();
