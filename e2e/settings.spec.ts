import { expect, test } from '@playwright/test';
import { expectNoSeriousAccessibilityViolations } from './accessibility';
import { expectSettingPersisted, monosaiDatabaseExists } from './storage';

test.describe('settings persistence', () => {
  test('remembers the chosen theme across a reload', async ({ page }) => {
    await page.goto('/#/settings');

    await page.getByRole('radio', { name: 'Dark' }).check();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expectSettingPersisted(page, 'app', 'theme', 'dark');

    await page.reload();

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('radio', { name: 'Dark' })).toBeChecked();
  });

  test('remembers reader aid preferences across a reload', async ({ page }) => {
    await page.goto('/#/settings');

    const furigana = page.getByRole('checkbox', { name: 'Furigana' });
    await expect(furigana).toBeChecked();
    await furigana.uncheck();
    await expectSettingPersisted(page, 'reader-preferences', 'furigana', false);

    await page.reload();

    await expect(page.getByRole('checkbox', { name: 'Furigana' })).not.toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Token spacing' })).toBeChecked();
  });

  test('creates the local database and reports its schema version', async ({ page }) => {
    await page.goto('/#/settings');

    const diagnostics = page.getByRole('region', { name: 'Diagnostics' });
    await expect(diagnostics.getByText('Database schema version')).toBeVisible();
    await expect(diagnostics).toContainText('1');

    expect(await monosaiDatabaseExists(page)).toBe(true);
  });

  test('asks twice before deleting all local data', async ({ page }) => {
    await page.goto('/#/settings');
    await page.getByRole('radio', { name: 'Dark' }).check();
    await expectSettingPersisted(page, 'app', 'theme', 'dark');

    await page.getByRole('button', { name: 'Delete all Monosai data' }).click();
    await expect(page.getByRole('alert')).toContainText('Continue?');

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('button', { name: 'Delete all Monosai data' })).toBeVisible();
    expect(await monosaiDatabaseExists(page)).toBe(true);
  });

  test('full reset deletes local data and returns to first use', async ({ page }) => {
    await page.goto('/#/settings');
    await page.getByRole('radio', { name: 'Dark' }).check();
    await expectSettingPersisted(page, 'app', 'theme', 'dark');

    await page.getByRole('button', { name: 'Delete all Monosai data' }).click();
    await page.getByRole('button', { name: 'Yes, delete everything' }).click();

    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.*/);
    await expect(page.getByRole('radio', { name: 'System' })).toBeChecked();
  });

  test('never exposes a saved credential in the DOM', async ({ page }) => {
    await page.goto('/#/settings');

    const content = await page.content();
    expect(content).not.toContain('apiKey');
    expect(content).not.toContain('sk-or-');
  });

  test('has no serious accessibility violations', async ({ page }) => {
    await page.goto('/#/settings');
    await expectNoSeriousAccessibilityViolations(page);
  });
});
