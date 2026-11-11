import { expect, test, type Locator, type Page } from '@playwright/test';
import { stubOpenRouter } from './openrouter';
import { expectMotionSettled } from './sheets';
import { GENERATION_READY_STATE, TTS_READY_STATE } from './state';

/**
 * Every dropdown is one dropdown: it hangs from its row, with its edge on the
 * card's edge and the card's width (up to its cap), and never leaves the column
 * or the screen.
 */
interface Box {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

async function box(locator: Locator): Promise<Box> {
  const found = await locator.boundingBox();
  expect(found).not.toBeNull();
  const { x, y, width, height } = found ?? { x: 0, y: 0, width: 0, height: 0 };
  return { left: x, right: x + width, top: y, bottom: y + height };
}

/**
 * Opens the field's dropdown and returns it, what it hangs from and the column once it has come
 * to rest. A choice in a settings row hangs from its row, with its edge on the card's; a bare
 * choice hangs from its field.
 */
async function openDropdown(
  page: Page,
  field: Locator,
): Promise<{ list: Box; field: Box; column: Box }> {
  await field.scrollIntoViewIfNeeded();
  await field.click();
  const list = page.locator('.mn-dropdown:popover-open');
  await expect(list).toBeVisible();
  await expectMotionSettled(page);
  const row = field.locator('xpath=ancestor::mn-settings-row[1]');
  return {
    list: await box(list),
    field: await box((await row.count()) > 0 ? row : field),
    column: await box(page.locator('mn-page').first()),
  };
}

function expectInside(
  { list, field, column }: { list: Box; field: Box; column: Box },
  page: Page,
): void {
  const viewport = page.viewportSize() ?? { width: 0, height: 0 };
  expect(list.left).toBeGreaterThanOrEqual(Math.max(column.left, 16) - 0.5);
  expect(list.right).toBeLessThanOrEqual(Math.min(column.right, viewport.width - 16) + 0.5);
  expect(list.top).toBeGreaterThanOrEqual(0);
  expect(list.bottom).toBeLessThanOrEqual(viewport.height);
  // It hangs from the field: right below it, or right above it.
  const gap = list.top >= field.bottom ? list.top - field.bottom : field.top - list.bottom;
  expect(gap).toBeGreaterThanOrEqual(0);
  expect(gap).toBeLessThanOrEqual(8);
  // At least as wide as the field, and never wider than the column.
  expect(list.right - list.left).toBeGreaterThanOrEqual(field.right - field.left - 0.5);
  expect(list.right - list.left).toBeLessThanOrEqual(column.right - column.left + 0.5);
}

for (const width of [320, 393]) {
  test.describe(`a dropdown at ${String(width)}px`, () => {
    test.use({ viewport: { width, height: 720 } });

    test.describe('from a row at the column end', () => {
      test.use({ storageState: TTS_READY_STATE });

      test('stays inside the column and the screen @mobile', async ({ page }) => {
        await stubOpenRouter(page);
        await page.goto('./#/settings/voice');
        const placed = await openDropdown(page, page.getByTestId('tts-voice-select'));

        expectInside(placed, page);
        // Its edge is on the card's edge, and it is as wide as the card on a phone.
        // The row sits inside the card's one-pixel border; the list's edge is the card's.
        expect(Math.abs(placed.list.left - placed.field.left)).toBeLessThanOrEqual(1.5);
        expect(Math.abs(placed.list.right - placed.field.right)).toBeLessThanOrEqual(1.5);
      });
    });

    test.describe('from a field at the column start', () => {
      test.use({ storageState: GENERATION_READY_STATE });

      test('stays inside the column and the screen @mobile', async ({ page }) => {
        await page.goto('./#/reading-level/vocabulary');
        const placed = await openDropdown(page, page.getByTestId('vocabulary-source-filter'));

        expectInside(placed, page);
        expect(placed.list.left).toBeCloseTo(placed.field.left, 0);
      });
    });
  });
}

test.describe('a dropdown and the page around it', () => {
  test.use({ viewport: { width: 393, height: 720 }, storageState: TTS_READY_STATE });

  test('closes on history back without leaving the page @mobile', async ({ page }) => {
    await stubOpenRouter(page);
    await page.goto('./#/library');
    await page.goto('./#/settings/voice');
    const field = page.getByTestId('tts-voice-select');
    await field.click();
    await expect(page.locator('.mn-dropdown:popover-open')).toBeVisible();

    await page.goBack();

    await expect(page.locator('.mn-dropdown:popover-open')).toHaveCount(0);
    await expect(field).toHaveAttribute('aria-expanded', 'false');
    await expect(page).toHaveURL(/#\/settings\/voice$/);

    // Back is the page's again once the list is gone, and choosing took no entry with it.
    await field.click();
    await page.locator('.mn-dropdown:popover-open [role="option"]').last().click();
    await expect(page.locator('.mn-dropdown:popover-open')).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(
          () => (history.state as Record<string, unknown> | null)?.['monosaiOverlayEntry'],
        ),
      )
      .toBeUndefined();
    await page.goBack();
    await expect(page).toHaveURL(/#\/library$/);
  });

  test('closes on a press outside without activating what was under it @mobile', async ({
    page,
  }) => {
    await stubOpenRouter(page);
    await page.goto('./#/settings/voice');
    await page.getByTestId('tts-voice-select').click();
    await expect(page.locator('.mn-dropdown:popover-open')).toBeVisible();

    await page.getByTestId('audio-model-picker').click({ force: true });

    await expect(page.locator('.mn-dropdown:popover-open')).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'Speech model' })).toHaveCount(0);
  });
});
