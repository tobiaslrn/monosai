import { expect, test } from '@playwright/test';
import { expectNoSeriousAccessibilityViolations } from './accessibility';
import { importReading } from './reading';

test.describe('application shell', () => {
  /**
   * Settings is a tab: the selected tab names it, so its bar holds no visible
   * title and no way back, yet the page still has its heading.
   */
  test('renders the settings tab with no way back and one bar @smoke', async ({ page }) => {
    await page.goto('./#/settings');

    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeAttached();
    const tabs = page.getByRole('navigation', { name: 'Main' });
    await expect(tabs.getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('link', { name: /^Back to/ })).toHaveCount(0);
    await expect(page).toHaveURL(/#\/settings$/);
  });

  /**
   * The line Home leads with is the way to the words and the level. There is
   * no second link to it: a label repeating the sentence beneath it in nearly
   * the same words is what this replaced.
   */
  test('reaches words and level from the Home standing line and back @smoke', async ({ page }) => {
    await importReading(page, '猫が好きです。犬も好きです。', 'ねこ');
    await page.goto('./#/home');

    const standing = page.getByTestId('home-standing');
    await expect(standing).toContainText('No words yet.');
    await expect(standing).toContainText('Connect Anki to write stories');

    await standing.click();

    await expect(page).toHaveURL(/#\/reading-level#words$/);
    await expect(page.getByRole('heading', { name: 'Words and level', level: 1 })).toBeVisible();

    await page.getByRole('button', { name: 'Back to home' }).click();
    await expect(page).toHaveURL(/#\/home$/);
  });

  /**
   * Settings holds no learner data, but its first row points at the page that
   * does: connecting an external application is something people come here to
   * look for, and finding nothing would say it cannot be done.
   */
  test('signposts words and level from Settings without describing it there', async ({ page }) => {
    await page.goto('./#/settings');

    await expect(page.getByText('Your setup')).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Vocabulary/ })).toHaveCount(0);

    const row = page.getByTestId('settings-reading-level');
    await expect(row).toContainText('Words and level');
    await expect(row).toContainText('No words yet');
    await row.click();

    await expect(page.getByRole('heading', { name: 'Words and level', level: 1 })).toBeVisible();
    await page.getByRole('button', { name: 'Back to settings' }).click();
    await expect(page).toHaveURL(/#\/settings$/);
  });

  /**
   * Vocabulary and Grammar were merged into one page. Their links live in
   * bookmarks and in anything Android saved, so each still lands on the half of
   * that page it meant, and still knows its way back.
   */
  test('redirects the two routes the reading-level page replaced', async ({ page }) => {
    await page.goto('./#/vocabulary');

    await expect(page).toHaveURL(/#\/reading-level/);
    await expect(page).toHaveURL(/#words$/);
    await expect(page.getByRole('heading', { name: 'Words and level', level: 1 })).toBeVisible();
    await page.getByRole('link', { name: 'Back to settings' }).click();
    await expect(page).toHaveURL(/#\/settings$/);

    await page.goto('./#/grammar?from=generate');

    await expect(page).toHaveURL(/#\/reading-level/);
    await expect(page).toHaveURL(/#grammar$/);
    await page.getByRole('link', { name: 'Back to story' }).click();
    await expect(page).toHaveURL(/#\/generate$/);
  });

  test('shows build diagnostics without user content', async ({ page }) => {
    await page.goto('./#/settings');

    const diagnostics = page.getByRole('region', { name: 'Troubleshooting' });
    await diagnostics.getByText('Advanced technical details').click();
    await expect(diagnostics.getByText('App version')).toBeVisible();
    await expect(diagnostics.getByText('Build commit')).toBeVisible();
  });

  test('has no serious accessibility violations @mobile @smoke', async ({ page }) => {
    await page.goto('./#/settings');
    await expectNoSeriousAccessibilityViolations(page);
  });

  test('deep links restore after reload', async ({ page }) => {
    await page.goto('./#/settings');
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeAttached();
  });

  /** Home's bar, standing line, and tab bar at 320px. */
  test('keeps the Home frame usable at 320px @mobile', async ({ page }) => {
    await importReading(page, '猫が好きです。犬も好きです。', 'ねこ');
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('./#/home');

    await expect(page.getByRole('link', { name: 'Help', exact: true })).toBeVisible();
    const tabs = page.getByRole('navigation', { name: 'Main' });
    for (const name of ['Home', 'Library', 'Settings']) {
      await expect(tabs.getByRole('link', { name, exact: true })).toBeVisible();
    }
    await expect(page.getByTestId('home-standing')).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
  });
});
