import { expect, test } from '@playwright/test';
import { expectNoSeriousAccessibilityViolations } from './accessibility';
import { expectSettingPersisted } from './storage';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('first-use Help', () => {
  test('keeps New story available on first paint and explains offline generation @smoke @mobile', async ({
    page,
  }) => {
    await page.goto('./#/library');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'New story', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'New story', exact: true }).click();
    await page.getByRole('link', { name: 'Write with AI', exact: true }).click();
    await expect(page.locator('.actions [data-check="text-model"] strong')).toHaveText('Text AI:');
    await expect(page.locator('.actions [data-check="vocabulary"] strong')).toHaveText(
      'Word list:',
    );
    await expect(page.getByTestId('generate')).toBeDisabled();
    await page.context().setOffline(true);
    await expect(page.locator('.actions [data-check="network"]')).toContainText('You are offline');
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
    await expect(page.locator('mn-app-bar')).toHaveCount(0);

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

test.describe('Help and utility bar', () => {
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
