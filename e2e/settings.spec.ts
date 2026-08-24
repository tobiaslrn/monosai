import { expect, test } from '@playwright/test';
import { expectNoSeriousAccessibilityViolations } from './accessibility';
import { expectSettingPersisted, monosaiDatabaseExists } from './storage';

test.describe('settings persistence', () => {
  test('puts learner controls before advanced and technical settings', async ({ page }) => {
    await page.goto('/#/settings');

    await expect(
      page.locator('main section.mn-panel > h2, main section.mn-panel > .heading-row > h2'),
    ).toHaveText([
      'Your setup',
      'Appearance',
      'Models',
      'Generation policy',
      'Storage',
      'App',
      'Troubleshooting',
    ]);
  });

  test('remembers the chosen theme across a reload', async ({ page }) => {
    await page.goto('/#/settings');

    await page.getByRole('radio', { name: 'Dark' }).check();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expectSettingPersisted(page, 'app', 'theme', 'dark');

    await page.reload();

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('radio', { name: 'Dark' })).toBeChecked();
  });

  test('leaves reader aid controls to the Reader Aids panel', async ({ page }) => {
    await page.goto('/#/settings');

    await expect(page.getByRole('group', { name: 'Reading aids' })).toHaveCount(0);
    await expect(page.getByRole('slider', { name: 'Text size' })).toHaveCount(0);
    await expect(page.getByRole('checkbox', { name: 'Furigana' })).toHaveCount(0);
    await expect(page.getByRole('checkbox', { name: 'Token spacing' })).toHaveCount(0);
    await expect(page.getByRole('checkbox', { name: 'Warning markers' })).toHaveCount(0);
  });

  test('keeps the AnkiConnect port out of App settings', async ({ page }) => {
    await page.goto('/#/settings');

    await expect(page.getByLabel('AnkiConnect port')).toHaveCount(0);
  });

  test('creates the local database and reports its schema version', async ({ page }) => {
    await page.goto('/#/settings');

    const diagnostics = page.getByRole('region', { name: 'Troubleshooting' });
    await expect(diagnostics.getByText('Database schema version')).toBeHidden();
    await diagnostics.getByText('Advanced technical details').click();
    await expect(diagnostics.getByText('Database schema version')).toBeVisible();
    await expect(diagnostics).toContainText('1');

    expect(await monosaiDatabaseExists(page)).toBe(true);
  });

  test('asks twice before deleting all local data', async ({ page }) => {
    await page.goto('/#/settings');
    await page.getByRole('radio', { name: 'Dark' }).check();
    await expectSettingPersisted(page, 'app', 'theme', 'dark');

    await page.getByTestId('danger-zone').locator('summary').click();
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

    await page.getByTestId('danger-zone').locator('summary').click();
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
