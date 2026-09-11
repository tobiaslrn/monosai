import { expect, test } from '@playwright/test';
import { expectNoSeriousAccessibilityViolations } from './accessibility';
import { expectSettingPersisted } from './storage';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('first-use Help', () => {
  test('keeps Write with AI available on first paint and explains offline generation @smoke @mobile', async ({
    page,
  }) => {
    await page.goto('./#/home');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const writeWithAi = page.getByRole('link', { name: 'Write with AI', exact: true });
    await expect(writeWithAi).toBeVisible();
    await writeWithAi.click();
    await expect(page.locator('[data-check="text-model"] strong')).toHaveText('Text AI:');
    await expect(page.locator('[data-check="vocabulary"] strong')).toHaveText('Word list:');
    await expect(page.getByTestId('generate')).toBeDisabled();
    await page.context().setOffline(true);
    await expect(page.locator('[data-check="network"]')).toContainText('You are offline');
    await expect(page.getByTestId('generate')).toHaveAttribute(
      'aria-describedby',
      'mn-generate-disabled-reason',
    );
    await expectNoSeriousAccessibilityViolations(page);
  });

  test('defers on a Reader deep link and persists dismissal across reloads @smoke', async ({
    page,
  }) => {
    await page.goto('./#/reader/2f8d3f4e-1b6a-4f7c-9c2e-0d5a6b7c8d9e');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('mn-page-header')).toHaveCount(0);

    await page.goto('./#/library');
    const dialog = page.getByRole('complementary', { name: 'A little help getting started' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Got it' }).click();
    await expectSettingPersisted(page, 'app', 'helpIntroSeen', true);
    await page.reload();
    await expect(dialog).toHaveCount(0);
  });

  test('opens the full guide and persists the choice @smoke', async ({ page }) => {
    await page.goto('./#/settings');
    await page.getByRole('button', { name: 'Read the guide' }).click();
    await expect(page).toHaveURL(/#\/help$/);
    await expect(page.getByRole('heading', { name: 'Help', level: 1 })).toBeVisible();
    await expectSettingPersisted(page, 'app', 'helpIntroSeen', true);
  });
});

test.describe('Help and the tab bar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./#/help');
    const dialog = page.getByRole('complementary', { name: 'A little help getting started' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Got it' }).click();
    await expect(dialog).toHaveCount(0);
    await expectSettingPersisted(page, 'app', 'helpIntroSeen', true);
  });

  test('links to each flow and names every icon-only destination @smoke', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Start here' })).toBeVisible();
    const github = page.getByRole('link', { name: 'GitHub (opens in a new tab)' });
    await expect(github).toHaveAttribute('href', 'https://github.com/tobiaslrn/monosai');
    await expect(github).toHaveAttribute('target', '_blank');
    await expect(github).toHaveAttribute('title', 'GitHub (opens in a new tab)');
    await page.getByRole('link', { name: 'Add text' }).click();
    await expect(page).toHaveURL(/#\/add$/);

    // Tabs name places, so each carries its label; Help is Home's one icon.
    await page.goto('./#/home');
    const tabs = page.getByRole('navigation', { name: 'Main' });
    await expect(tabs.getByRole('link')).toHaveText(['Home', 'Library', 'Settings']);
    const help = page.getByRole('link', { name: 'Help', exact: true });
    await expect(help).toHaveAttribute('title', 'Help');
    await expect(help).toHaveText('');
  });

  test('supports keyboard focus, accessibility, reload, and a 320px viewport @mobile @smoke', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Help', level: 1 })).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
    await page.getByRole('main').focus();
    await expect(page.getByRole('main')).toBeFocused();
    await expectNoSeriousAccessibilityViolations(page);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
  });
});
