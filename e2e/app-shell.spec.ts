import { expect, test } from '@playwright/test';
import { expectNoSeriousAccessibilityViolations } from './accessibility';
import { importReading } from './reading';

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

  /**
   * The line the Library leads with is the way to what the learner can read.
   * The masthead carries no second link to it: a label repeating the sentence
   * beneath it in nearly the same words is what this replaced.
   */
  test('reaches what you can read from the Library standing line and back @smoke', async ({
    page,
  }) => {
    await importReading(page, '猫が好きです。犬も好きです。', 'ねこ');
    await page.goto('./#/library');

    const standing = page.getByTestId('library-standing');
    await expect(standing).toContainText('No words yet.');
    await expect(standing).toContainText('Connect Anki to write stories');

    await standing.click();

    await expect(page).toHaveURL(/#\/reading-level$/);
    await expect(page.getByRole('heading', { name: 'What you can read', level: 1 })).toBeVisible();

    await page.getByRole('button', { name: 'Back to library' }).click();
    await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible();
  });

  /**
   * Settings holds no learner data, but it does point at the page that does:
   * connecting an external application is something people come here to look
   * for, and finding nothing would say it cannot be done.
   */
  test('signposts what you can read from Settings without describing it there', async ({
    page,
  }) => {
    await page.goto('./#/settings');

    await expect(page.getByText('Your setup')).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Vocabulary/ })).toHaveCount(0);

    const row = page.getByTestId('settings-reading-level');
    await expect(row).toContainText('What you can read');
    await expect(row).toContainText('No words yet');
    await row.click();

    await expect(page.getByRole('heading', { name: 'What you can read', level: 1 })).toBeVisible();
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

  /** The mark, the standing line and one labelled control, at 320px. */
  test('keeps the Library head usable at 320px @mobile', async ({ page }) => {
    await importReading(page, '猫が好きです。犬も好きです。', 'ねこ');
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('./#/library');

    await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible();
    await expect(page.getByTestId('library-standing')).toBeVisible();
    await expect(page.locator('.wordmark')).toBeHidden();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
  });
});
