import { expect, test } from '@playwright/test';
import { expectNoSeriousAccessibilityViolations } from './accessibility';

test.describe('application shell', () => {
  test('renders navigation and the settings route', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page).toHaveURL(/#\/settings$/);
  });

  test('shows build diagnostics without user content', async ({ page }) => {
    await page.goto('/');

    const diagnostics = page.getByRole('region', { name: 'Diagnostics' });
    await expect(diagnostics.getByText('App version')).toBeVisible();
    await expect(diagnostics.getByText('Build commit')).toBeVisible();
  });

  test('has no serious accessibility violations', async ({ page }) => {
    await page.goto('/');
    await expectNoSeriousAccessibilityViolations(page);
  });

  test('deep links restore after reload', async ({ page }) => {
    await page.goto('/#/settings');
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  });
});
