import { expect, test } from '@playwright/test';
import { expectNoSeriousAccessibilityViolations } from './accessibility';
import { importReading, SAMPLE_TEXT } from './reading';

/**
 * Two tabs on one local database.
 *
 * A local-first application has no server to tell the other tab anything, so
 * the second tab used to go on rendering a reading the first had deleted —
 * heading, tokens, and cached aids all live — until it was navigated away and
 * back. See ADR 0042.
 */
test.describe('two tabs on one library', () => {
  test('a reading deleted in one tab stops being shown in the other', async ({ context }) => {
    const first = await context.newPage();
    await importReading(first, SAMPLE_TEXT, 'Cross-tab reading');
    const readerUrl = first.url();

    const second = await context.newPage();
    await second.goto(readerUrl);
    await expect(second.getByRole('heading', { name: 'Cross-tab reading' })).toBeVisible();

    await first.goto('./#/library');
    const card = first.getByRole('article').filter({ hasText: 'Cross-tab reading' });
    await card.getByRole('button', { name: 'Actions for Cross-tab reading' }).click();
    await card.getByRole('menuitem', { name: 'Delete' }).click();
    await first.getByRole('button', { name: 'Delete permanently' }).click();
    await expect(first.getByText('Cross-tab reading')).toHaveCount(0);

    // No reload in the second tab: it must correct itself.
    await expect(second).toHaveURL(/#\/library/);
    await expect(second.getByRole('heading', { name: 'Cross-tab reading' })).toHaveCount(0);
  });

  test('a library in another tab drops the row without being reloaded', async ({ context }) => {
    const first = await context.newPage();
    await importReading(first, SAMPLE_TEXT, 'Shelf reading');
    await first.goto('./#/library');

    const second = await context.newPage();
    await second.goto('./#/library');
    await expect(second.getByText('Shelf reading')).toBeVisible();

    const card = first.getByRole('article').filter({ hasText: 'Shelf reading' });
    await card.getByRole('button', { name: 'Actions for Shelf reading' }).click();
    await card.getByRole('menuitem', { name: 'Delete' }).click();
    await first.getByRole('button', { name: 'Delete permanently' }).click();

    await expect(second.getByText('Shelf reading')).toHaveCount(0);
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

    await expect(
      page.getByRole('heading', { name: 'This reading is no longer here' }),
    ).toBeVisible();
  });
});

/** Add text is one form, not a stepper missing its tabs. */
test.describe('Add text semantics', () => {
  test('exposes no tab pattern and passes an axe scan', async ({ page }) => {
    await page.goto('./#/add');
    await expect(page.getByLabel('Japanese text')).toBeVisible();

    expect(await page.locator('[role="tabpanel"], [role="tab"], [role="tablist"]').count()).toBe(0);
    await expect(page.getByText('0 of 50,000 characters')).toBeVisible();
    await expectNoSeriousAccessibilityViolations(page);
  });
});
