import { expect, test, type Page } from '@playwright/test';
import { expectMotionSettled } from '../e2e/sheets';
import { GALLERY_OVERLAYS, GALLERY_PAGES } from '../src/app/features/gallery/gallery-pages';

/**
 * One baseline per gallery page, and one per overlay open over its page, in
 * each project's size and theme. A difference fails with the diff in the
 * report; whether it is a regression is judged from that diff, never by
 * updating the baseline to match.
 */

test.beforeEach(async ({ page }) => {
  // The wordmark lands on a random spelling. A seeded generator makes it, and
  // anything else drawn by chance, the same on every run.
  await page.addInitScript(() => {
    let seed = 20_261_122;
    Math.random = () => {
      seed = (seed * 16_807) % 2_147_483_647;
      return (seed - 1) / 2_147_483_646;
    };
  });
});

async function openGalleryPage(page: Page, slug: string): Promise<void> {
  await page.goto(`./#/gallery/${slug}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => [...document.images].every((image) => image.complete));
  await expectMotionSettled(page);
}

test('the gallery index', async ({ page }) => {
  await openGalleryPage(page, '');
  await expect(page).toHaveScreenshot('index.png', { fullPage: true });
});

for (const { slug } of GALLERY_PAGES) {
  test(`the ${slug} page`, async ({ page }) => {
    await openGalleryPage(page, slug);
    await expect(page).toHaveScreenshot(`${slug}.png`, { fullPage: true });
  });
}

for (const overlay of GALLERY_OVERLAYS) {
  test(`the ${overlay.slug} open`, async ({ page }) => {
    await openGalleryPage(page, 'overlays');
    await page.getByRole(overlay.role, { name: overlay.trigger, exact: true }).click();
    await expect(
      page.locator('.cdk-overlay-pane, :popover-open').filter({ visible: true }).first(),
    ).toBeVisible();
    await expectMotionSettled(page);
    await expect(page).toHaveScreenshot(`overlay-${overlay.slug}.png`);
  });
}
