import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
const browser = await chromium.launch();
const state = JSON.parse(await fs.readFile('playwright/.auth/intro-seen.json', 'utf8'));
state.origins[0].origin = 'http://localhost:4200';
const context = await browser.newContext({
  storageState: state,
  viewport: { width: 393, height: 851 },
  serviceWorkers: 'block',
});
const page = await context.newPage();
await page.goto('http://localhost:4200/#/add');
await page.getByLabel('Japanese text').fill('猫が好きです。犬も好きです。');
await page.getByLabel('Title (optional)').fill('A New Bicycle');
await page.getByRole('button', { name: 'Add story', exact: true }).click();
await expect(page).toHaveURL(/reader/);
await page.evaluate(
  () =>
    new Promise((resolve, reject) => {
      const request = indexedDB.open('monosai');
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('readings', 'readwrite');
        const store = tx.objectStore('readings');
        const rows = store.getAll();
        rows.onsuccess = () => {
          const titles = [
            'A New Bicycle',
            'The Library Window',
            'A Walk in the Mountains',
            'The Night Sky',
            'A Special Cup of Tea',
            'The Little Garden',
            'A Rainy Afternoon',
            'On the Way Home',
          ];
          titles.forEach((title, index) =>
            store.put({
              ...rows.result[0],
              id: index === 0 ? rows.result[0].id : crypto.randomUUID(),
              title,
              lastOpenedAt: index % 3 === 0 ? Date.now() : null,
              createdAt: Date.now() - (index < 2 ? 0 : index < 4 ? 1 : 4) * 86400000,
            }),
          );
        };
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = reject;
      };
    }),
);
await page.goto('http://localhost:4200/#/library');
await expect(page.locator('mn-reading-card')).toHaveCount(8);
await page.goto('http://localhost:4200/#/home');
await expect(page.getByTestId('home-standing')).toContainText('No words yet.');
await page.screenshot({ path: '../.home-before.png', fullPage: true });
await context.storageState({ path: '.home-review-state.json', indexedDB: true });
await browser.close();
