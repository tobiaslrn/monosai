import { expect, test } from '@playwright/test';
import { expectNoSeriousAccessibilityViolations } from './accessibility';

test.describe('application shell', () => {
  /**
   * There is no application-wide navigation. Each page states where it goes
   * back to, so the reading is the only thing that persists on screen.
   */
  test('renders the settings route with a way back and no navigation bar @smoke', async ({
    page,
  }) => {
    await page.goto('./#/settings');

    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
    await expect(page.getByRole('navigation')).toHaveCount(0);
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to library' })).toBeVisible();
    await expect(page).toHaveURL(/#\/settings$/);
  });

  /** Settings is configuration only; nothing there describes the learner. */
  test('keeps the learner profile out of Settings', async ({ page }) => {
    await page.goto('./#/settings');

    await expect(page.getByRole('link', { name: /Vocabulary/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /^Grammar/ })).toHaveCount(0);
    await expect(page.getByText('Your setup')).toHaveCount(0);
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
    await expect(page.getByRole('heading', { name: 'What you can read', level: 1 })).toBeVisible();
    await page.getByRole('link', { name: 'Back to library' }).click();
    await expect(page).toHaveURL(/#\/library$/);

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
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  });

  test('keeps the Library identity and Settings action usable at 320px @mobile', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('./#/library');

    await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible();
    await expect(page.locator('.wordmark')).toBeHidden();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
  });
});
