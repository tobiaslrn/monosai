import { expect, test } from '@playwright/test';
import { expectNoSeriousAccessibilityViolations } from './accessibility';
import { expectSettingPersisted } from './storage';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('first-use Help', () => {
  /**
   * A first paint offers two doors that state their cost, and the AI one leads
   * to the setup it needs rather than to a form that cannot be submitted. The
   * shelf's New story action is not offered here at all: it is the most
   * prominent control on the page and it can produce nothing on a first run.
   */
  test('prices both doors on first paint and sequences AI setup @smoke @mobile', async ({
    page,
  }) => {
    await page.goto('./#/library');
    const alpha = page.getByRole('alertdialog', { name: 'Monosai is in alpha.' });
    await expect(alpha).toBeVisible();
    await alpha.getByRole('button', { name: 'Continue' }).click();
    await expectSettingPersisted(page, 'app', 'alphaNoticeSeen', true);
    await expect(page.getByRole('dialog')).toHaveCount(0);

    const intro = page.getByRole('complementary', { name: 'A little help getting started' });
    await expect(intro).toContainText('New here?');
    await expect(page.getByRole('button', { name: 'Create a new story' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Paste Japanese text/ })).toContainText(
      'Works now. No account.',
    );
    const withAi = page.getByRole('link', { name: /Write with AI/ });
    await expect(withAi).toContainText('Needs an OpenRouter key.');

    await withAi.click();
    await expect(page.getByRole('heading', { name: 'Set up AI stories', level: 1 })).toBeVisible();
    await expect(page.locator('mn-story-form')).toHaveCount(0);
    await expect(page.locator('[data-check="vocabulary"] strong')).toHaveText('Your words:');
    await expect(page.locator('[data-check="reading-level"]')).toContainText('Done.');
    await expect(page.locator('[data-check="text-model"] strong')).toHaveText('AI model:');

    await page.context().setOffline(true);
    await expect(page.locator('[data-check="network"]')).toContainText('You are offline');
    await expectNoSeriousAccessibilityViolations(page);
  });

  test('defers on a Reader deep link and persists dismissal across reloads @smoke', async ({
    page,
  }) => {
    await page.goto('./#/reader/2f8d3f4e-1b6a-4f7c-9c2e-0d5a6b7c8d9e');
    const alpha = page.getByRole('alertdialog', { name: 'Monosai is in alpha.' });
    await expect(alpha).toBeVisible();
    await alpha.getByRole('button', { name: 'Continue' }).click();
    await expectSettingPersisted(page, 'app', 'alphaNoticeSeen', true);
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

  /**
   * The offer belongs to the Library, so a deep link elsewhere is not
   * interrupted by it and keeps its own bar at the top of the screen.
   */
  test('opens the full guide and persists the choice @smoke', async ({ page }) => {
    await page.goto('./#/settings');
    const alpha = page.getByRole('alertdialog', { name: 'Monosai is in alpha.' });
    await expect(alpha).toBeVisible();
    await alpha.getByRole('button', { name: 'Continue' }).click();
    await expectSettingPersisted(page, 'app', 'alphaNoticeSeen', true);
    await expect(page.getByRole('button', { name: 'Read the guide' })).toHaveCount(0);

    await page.goto('./#/library');
    await page.getByRole('button', { name: 'Read the guide' }).click();
    await expect(page).toHaveURL(/#\/help$/);
    await expect(page.getByRole('heading', { name: 'Help', level: 1 })).toBeVisible();
    await expectSettingPersisted(page, 'app', 'helpIntroSeen', true);
  });
});

test.describe('Help and utility bar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./#/library');
    const alpha = page.getByRole('alertdialog', { name: 'Monosai is in alpha.' });
    await expect(alpha).toBeVisible();
    await alpha.getByRole('button', { name: 'Continue' }).click();
    await expectSettingPersisted(page, 'app', 'alphaNoticeSeen', true);
    const dialog = page.getByRole('complementary', { name: 'A little help getting started' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Got it' }).click();
    await expect(dialog).toHaveCount(0);
    await expectSettingPersisted(page, 'app', 'helpIntroSeen', true);
    await page.goto('./#/help');
  });

  test('links to each flow and names every icon-only destination @smoke', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'First five minutes' })).toBeVisible();
    const github = page.getByRole('link', { name: 'GitHub (opens in a new tab)' });
    await expect(github).toHaveAttribute('href', 'https://github.com/tobiaslrn/monosai');
    await expect(github).toHaveAttribute('target', '_blank');
    await expect(github).toHaveAttribute('title', 'GitHub (opens in a new tab)');
    await page.getByRole('link', { name: 'Paste Japanese text' }).click();
    await expect(page).toHaveURL(/#\/add$/);

    await page.goto('./#/library');
    const utilities = page.getByRole('navigation', { name: 'Utilities' });
    await expect(utilities.getByRole('link')).toHaveCount(2);
    const settings = utilities.getByRole('link', { name: 'Settings', exact: true });
    await expect(settings).toHaveAttribute('title', 'Settings');
    await expect(settings).toHaveText('');
    await expect(utilities.getByRole('link', { name: 'Help', exact: true })).toHaveAttribute(
      'title',
      'Help',
    );
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
