import { expect, test, type Page } from '@playwright/test';
import { expectNoSeriousAccessibilityViolations } from './accessibility';
import { importReading, SAMPLE_TEXT } from './reading';

/**
 * One engine owns the origin's data at a time, so a second tab says so instead
 * of starting, and starts once the first is gone.
 */
test.describe('a second tab', () => {
  test('says Monosai is open in another tab, and starts after the first closes @smoke', async ({
    context,
  }) => {
    const first = await context.newPage();
    await first.goto('./#/library');
    await expect(first.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible();

    const second = await context.newPage();
    await second.goto('./#/library');
    await expect(second.getByText('Monosai is open in another tab')).toBeVisible();
    await expect(second.getByRole('button', { name: 'Reload' })).toBeEnabled();
    await expectNoSeriousAccessibilityViolations(second);

    await first.close();
    await second.getByRole('button', { name: 'Reload' }).click();
    await expect(second.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible();
  });
});

/**
 * A mistyped or truncated link never named a reading, so it cannot be
 * described as one that was deleted.
 */
test.describe('a link that is not a reading', () => {
  test('says the address is not one Monosai issues, and claims no deletion', async ({ page }) => {
    await page.goto('./#/reader/not-a-uuid');

    await expect(
      page.getByRole('heading', { name: 'That link does not point to a reading' }),
    ).toBeVisible();
    await expect(page.getByText('no longer here')).toHaveCount(0);
    await expect(page.getByText('may have been deleted')).toHaveCount(0);
    await expectNoSeriousAccessibilityViolations(page);

    await page.getByRole('link', { name: 'Back to library' }).click();
    await expect(page).toHaveURL(/#\/library/);
  });

  test('a well-formed id that is not stored still reads as a missing reading', async ({ page }) => {
    await page.goto('./#/reader/3f6d2c1a-9b4e-4a7d-8f21-0c5e7a9b1d33');

    await expect(page.getByRole('heading', { name: 'This story is no longer here' })).toBeVisible();
  });
});

/** Add text is one form, not a stepper missing its tabs. */
test.describe('Add text semantics', () => {
  test('exposes no tab pattern and passes an axe scan', async ({ page }) => {
    await page.goto('./#/add');
    await expect(page.getByLabel('Japanese text')).toBeVisible();

    expect(await page.locator('[role="tabpanel"], [role="tab"], [role="tablist"]').count()).toBe(0);
    // The counter waits until the text is near its limit.
    await expect(page.getByText('of 50,000 characters')).toHaveCount(0);
    await expectNoSeriousAccessibilityViolations(page);
  });
});

/** Another tab, or a newer build, takes the database from a tab that is still open. */
test.describe('a tab that lost its database', () => {
  async function upgradeFromAnotherTab(page: Page): Promise<void> {
    await page.evaluate(
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
  }

  test('the reader says it can no longer save, and keeps saying it when the tab is revisited @smoke @mobile', async ({
    context,
  }) => {
    const first = await context.newPage();
    await importReading(first, SAMPLE_TEXT, 'Lost database reading');
    const second = await context.newPage();
    await second.goto('./#/library');

    await upgradeFromAnotherTab(second);

    const notice = first.getByRole('alert').filter({ hasText: 'can no longer save' });
    await expect(notice).toBeVisible();
    await expect(first.locator('mn-reader-paragraph').first()).toBeVisible();
    await first.evaluate(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    // eslint-disable-next-line no-restricted-syntax -- an absence only shows over elapsed time
    await first.waitForTimeout(500);
    await expect(notice).toBeVisible();
    await expect(notice.getByRole('button', { name: 'Reload' })).toBeEnabled();
  });

  test('reload asks before discarding an unsaved draft, and nothing reloads on its own @smoke', async ({
    context,
  }) => {
    const first = await context.newPage();
    await first.goto('./#/add');
    await first.getByLabel('Japanese text').fill(SAMPLE_TEXT);
    const second = await context.newPage();
    await second.goto('./#/library');

    await upgradeFromAnotherTab(second);

    const notice = first.getByRole('alert').filter({ hasText: 'can no longer save' });
    await expect(notice).toBeVisible();
    await expect(notice).not.toContainText('Waiting for current work');
    await expect(first.getByLabel('Japanese text')).toHaveValue(SAMPLE_TEXT);

    await notice.getByRole('button', { name: 'Reload' }).click();
    const confirm = first.getByRole('alertdialog', { name: 'Reload and lose unsaved work?' });
    await expect(confirm).toContainText('An import draft is unsaved');
    await confirm.getByRole('button', { name: 'Stay here' }).click();
    await expect(confirm).toHaveCount(0);
    await expect(first.getByLabel('Japanese text')).toHaveValue(SAMPLE_TEXT);

    await first.evaluate(() => {
      (window as unknown as { loadedBefore: boolean }).loadedBefore = true;
    });
    await notice.getByRole('button', { name: 'Reload' }).click();
    await confirm.getByRole('button', { name: 'Reload' }).click();
    await expect
      .poll(
        () => first.evaluate(() => (window as unknown as { loadedBefore?: boolean }).loadedBefore),
        { timeout: 15_000 },
      )
      .toBeUndefined();
  });
});
