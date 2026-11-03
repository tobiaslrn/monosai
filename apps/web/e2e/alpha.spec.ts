import { expect, test } from '@playwright/test';
import { expectSettingPersisted } from './storage';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('alpha disclosure', () => {
  test('requires acknowledgment once and marks the Library icon @smoke @mobile', async ({
    page,
  }) => {
    await page.goto('./#/library');

    const dialog = page.getByRole('alertdialog', { name: 'Monosai is in alpha.' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(
      'It is still being built, so you may encounter bugs, missing features, or changes.',
    );
    await expect(dialog.getByRole('button', { name: 'Continue' })).toBeFocused();

    await dialog.getByRole('button', { name: 'Continue' }).click();
    await expectSettingPersisted(page, 'app', 'alphaNoticeSeen', true);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.locator('.alpha-marker')).toHaveText('α');

    await page.reload();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.locator('.alpha-marker')).toHaveText('α');
  });

  test('also appears before a direct reader link on first load @smoke', async ({ page }) => {
    await page.goto('./#/reader/2f8d3f4e-1b6a-4f7c-9c2e-0d5a6b7c8d9e');

    await expect(page.getByRole('alertdialog', { name: 'Monosai is in alpha.' })).toBeVisible();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
  });
});
