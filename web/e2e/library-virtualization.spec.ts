import { expect, test } from '@playwright/test';
import { importReading } from './reading';

/** Adds enough wrapping reading rows to cross the repository's 12-row page boundary. */
async function seedMoreLibraryRows(
  page: Parameters<typeof importReading>[0],
  count = 24,
): Promise<void> {
  await page.evaluate(
    ({ count: rowCount }) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('monosai');
        request.onerror = () => {
          reject(new Error('could not open the Monosai database'));
        };
        request.onsuccess = () => {
          const database = request.result;
          const read = database
            .transaction('readings', 'readonly')
            .objectStore('readings')
            .getAll();
          read.onerror = () => {
            database.close();
            reject(new Error('could not read the seed reading'));
          };
          read.onsuccess = () => {
            const template = read.result[0] as Record<string, unknown> | undefined;
            if (template === undefined) {
              database.close();
              reject(new Error('the seed reading was not saved'));
              return;
            }
            const transaction = database.transaction('readings', 'readwrite');
            const store = transaction.objectStore('readings');
            const now = Date.now();
            for (let index = 1; index <= rowCount; index += 1) {
              store.put({
                ...template,
                id: crypto.randomUUID(),
                title: `Page story ${String(index)} ${'語'.repeat(32)}`,
                createdAt: now - index * 1_000,
                updatedAt: now - index * 1_000,
              });
            }
            transaction.onerror = () => {
              database.close();
              reject(new Error('could not seed the library rows'));
            };
            transaction.oncomplete = () => {
              database.close();
              resolve();
            };
          };
        };
      }),
    { count },
  );
}

test('loads the next library page at the window end without Show more @smoke @mobile', async ({
  page,
}) => {
  await importReading(page, '猫がいる。', 'Seed story');
  await page.goto('./#/library');
  await seedMoreLibraryRows(page);
  await page.goto('./#/library');

  await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Seed story' })).toBeVisible();
  const lastRow = page.getByRole('link', { name: /Page story 24/ });
  await expect(lastRow).toHaveCount(0);

  await expect
    .poll(
      async () => {
        await page.evaluate(() => {
          window.scrollTo(0, document.documentElement.scrollHeight);
        });
        return lastRow.isVisible();
      },
      { timeout: 15_000 },
    )
    .toBe(true);

  const layout = await lastRow.evaluate((link) => {
    const card = link.closest('mn-reading-card');
    const title = card?.querySelector('h3');
    const status = card?.querySelector('.mn-status-pill');
    const menu = card?.querySelector('.menu-anchor');
    if (
      title === null ||
      title === undefined ||
      status === null ||
      status === undefined ||
      menu === null ||
      menu === undefined
    ) {
      return null;
    }
    const titleRect = title.getBoundingClientRect();
    const statusRect = status.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    return {
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      titleScrollWidth: title.scrollWidth,
      titleClientWidth: title.clientWidth,
      titleHeight: titleRect.height,
      titleRight: titleRect.right,
      statusLeft: statusRect.left,
      statusRight: statusRect.right,
      menuLeft: menuRect.left,
    };
  });
  expect(layout).not.toBeNull();
  expect(layout?.documentWidth).toBeLessThanOrEqual(layout?.viewportWidth ?? 0);
  expect(layout?.titleScrollWidth).toBeLessThanOrEqual(layout?.titleClientWidth ?? 0);
  expect(layout?.titleHeight).toBeGreaterThan(20);
  expect(layout?.titleRight).toBeLessThanOrEqual(layout?.statusLeft ?? 0);
  expect(layout?.statusRight).toBeLessThanOrEqual(layout?.menuLeft ?? 0);
  await expect(page.getByRole('button', { name: 'Show more', exact: true })).toHaveCount(0);
});

test('restores a deep window position after leaving and returning @smoke @mobile', async ({
  page,
}) => {
  await importReading(page, '猫がいる。', 'Seed story');
  await page.goto('./#/library');
  await seedMoreLibraryRows(page, 48);
  await page.goto('./#/library');

  await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Seed story' })).toBeVisible();
  const lastRow = page.getByRole('link', { name: /Page story 48/ });
  await expect
    .poll(
      async () => {
        await page.evaluate(() => {
          window.scrollTo(0, document.documentElement.scrollHeight);
        });
        return lastRow.isVisible();
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  const savedPosition = await page.evaluate(() => window.scrollY);
  expect(savedPosition).toBeGreaterThan(1_000);

  await page.evaluate(() => {
    document.querySelector<HTMLAnchorElement>('a[aria-label="Settings"]')?.click();
  });
  await expect(page).toHaveURL(/#\/settings$/);
  await page.getByRole('link', { name: 'Back to library' }).click();
  await expect(page).toHaveURL(/#\/library$/);
  await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible();

  await expect
    .poll(() => page.evaluate(() => window.scrollY), { timeout: 20_000 })
    .toBeGreaterThanOrEqual(savedPosition - 2);
});
