import { expect, test } from '@playwright/test';
import { expectNoSeriousAccessibilityViolations } from './accessibility';

test.describe('application shell', () => {
  /**
   * There is no application-wide navigation. Each page states where it goes
   * back to, so the reading is the only thing that persists on screen.
   */
  test('renders the settings route with a way back and no navigation bar', async ({ page }) => {
    await page.goto('/#/settings');

    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
    await expect(page.getByRole('navigation')).toHaveCount(0);
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to library' })).toBeVisible();
    await expect(page).toHaveURL(/#\/settings$/);
  });

  test('reaches Vocabulary and Grammar through Settings', async ({ page }) => {
    await page.goto('/#/settings');

    await page.getByRole('link', { name: /Vocabulary/ }).click();
    await expect(page.getByRole('heading', { name: 'Vocabulary', level: 1 })).toBeVisible();
    await page.getByRole('link', { name: 'Back to settings' }).click();

    await page.getByRole('link', { name: /Grammar/ }).click();
    await expect(page.getByRole('heading', { name: 'Grammar', level: 1 })).toBeVisible();
  });

  test('shows build diagnostics without user content', async ({ page }) => {
    await page.goto('/#/settings');

    const diagnostics = page.getByRole('region', { name: 'Diagnostics' });
    await diagnostics.getByText('Show build details').click();
    await expect(diagnostics.getByText('App version')).toBeVisible();
    await expect(diagnostics.getByText('Build commit')).toBeVisible();
  });

  test('has no serious accessibility violations', async ({ page }) => {
    await page.goto('/#/settings');
    await expectNoSeriousAccessibilityViolations(page);
  });

  test('deep links restore after reload', async ({ page }) => {
    await page.goto('/#/settings');
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  });
});
