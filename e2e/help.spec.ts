import { expect, test } from '@playwright/test';
import { expectNoSeriousAccessibilityViolations } from './accessibility';
import { expectSettingPersisted } from './storage';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('first-use Help', () => {
  test('defers on a Reader deep link and persists dismissal across reloads @smoke', async ({
    page,
  }) => {
    await page.goto('./#/reader/not-a-reading');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('mn-app-bar')).toHaveCount(0);

    await page.goto('./#/library');
    const dialog = page.getByRole('dialog', { name: 'A little help getting started' });
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

test.describe('Help and utility bar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./#/help');
    const dialog = page.getByRole('dialog', { name: 'A little help getting started' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Got it' }).click();
    await expect(dialog).toHaveCount(0);
    await expectSettingPersisted(page, 'app', 'helpIntroSeen', true);
  });

  test('links to each flow and names every icon-only destination @smoke', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Start here' })).toBeVisible();
    await expect(page.getByText('Gemini TTS works by far the best in Monosai.')).toBeVisible();
    const utilities = page.getByRole('navigation', { name: 'Utilities' });
    await expect(utilities.getByRole('link')).toHaveCount(3);
    const settings = utilities.getByRole('link', { name: 'Settings', exact: true });
    await expect(settings).toHaveAttribute('title', 'Settings');
    await expect(settings).toHaveText('');
    await expect(utilities.getByRole('link', { name: 'Help', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    const github = utilities.getByRole('link', { name: 'GitHub (opens in a new tab)' });
    await expect(github).toHaveAttribute('href', 'https://github.com/tobiaslrn/monosai');
    await expect(github).toHaveAttribute('target', '_blank');
    await page.getByRole('link', { name: 'Add text' }).click();
    await expect(page).toHaveURL(/#\/add$/);
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
