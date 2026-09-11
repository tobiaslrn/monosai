import { expect, test, type Page } from '@playwright/test';
import { pasteAndContinue, saveAndOpenReader } from './reading';

function tabs(page: Page) {
  return page.getByRole('navigation', { name: 'Main' });
}

/**
 * Home, Library and Settings are the three tab pages. The bar sits at the foot
 * of a phone and in the top bar of a wide screen, and only one of the two is
 * ever exposed, which is why this runs in both lanes (ADR 0070).
 */
test.describe('tab navigation', () => {
  test('opens on Home and moves between the three tabs @smoke @mobile', async ({ page }) => {
    await page.goto('./');

    await expect(page).toHaveURL(/#\/home$/);
    // The hero moved here from the Library; the palette's own art must load.
    const illustration = page.locator('.hero-art img:visible');
    await expect(illustration).toHaveCount(1);
    await expect
      .poll(() => illustration.evaluate((image: HTMLImageElement) => image.naturalWidth))
      .toBeGreaterThan(0);
    // A phone docks the three tabs; a wide screen's mark is Home and Help joins the tabs (ADR 0071).
    const wide = (page.viewportSize()?.width ?? 0) >= 960;
    await expect(tabs(page).getByRole('link')).toHaveText(
      wide ? ['Library', 'Settings', 'Help'] : ['Home', 'Library', 'Settings'],
    );
    // Exactly one visible link home in either layout: the mark or the docked tab.
    const home = page.getByRole('link', { name: 'Home', exact: true });
    await expect(home).toHaveCount(1);
    await expect(home).toHaveAttribute('aria-current', 'page');

    for (const [name, path] of [
      ['Library', /#\/library$/],
      ['Settings', /#\/settings$/],
      ['Home', /#\/home$/],
    ] as const) {
      const link = page.getByRole('link', { name, exact: true });
      await link.click();
      await expect(page).toHaveURL(path);
      await expect(link).toHaveAttribute('aria-current', 'page');
      await expect(page.locator('[aria-current="page"]:visible')).toHaveCount(1);
    }
    // The selected tab names the page; a screen reader still gets a heading.
    await tabs(page).getByRole('link', { name: 'Library' }).click();
    await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeAttached();
  });

  test('starts either kind of story from Home in one tap @smoke @mobile', async ({ page }) => {
    await page.goto('./#/home');

    await page.getByRole('link', { name: 'Write with AI', exact: true }).click();
    await expect(page).toHaveURL(/#\/generate$/);
    await expect(tabs(page)).toHaveCount(0);
    await page.getByLabel('Back to home').click();
    await expect(page).toHaveURL(/#\/home$/);

    await page.getByRole('link', { name: 'Paste text', exact: true }).click();
    await expect(page).toHaveURL(/#\/add$/);
    await expect(tabs(page)).toHaveCount(0);
  });

  test('leaves the reader without a tab bar, and goes back to Home @smoke @mobile', async ({
    page,
  }) => {
    await page.goto('./#/home');
    await page.getByRole('link', { name: 'Paste text', exact: true }).click();
    await pasteAndContinue(page, '猫がいる。犬が来た。');
    await saveAndOpenReader(page);

    await expect(tabs(page)).toHaveCount(0);

    await page.getByRole('link', { name: 'Back to home' }).click();
    await expect(page).toHaveURL(/#\/home$/);
    await expect(tabs(page)).toBeVisible();
  });
});
