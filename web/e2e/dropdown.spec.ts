import { expect, test, type Locator, type Page } from '@playwright/test';
import { stubOpenRouter } from './openrouter';
import { expectMotionSettled } from './sheets';
import { GENERATION_READY_STATE, TTS_READY_STATE } from './state';

/**
 * Every dropdown is one dropdown: it hangs from its field, starting at the
 * field's start edge (or ending at its end edge where it would leave the
 * column), at least as wide as the field, and never leaves the column or the
 * screen.
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

/** Opens the field's dropdown and returns it, the field and the column once it has come to rest. */
async function openDropdown(
  page: Page,
  field: Locator,
): Promise<{ list: Box; field: Box; column: Box }> {
  await field.scrollIntoViewIfNeeded();
  await field.click();
  const list = page.locator('.mn-dropdown:popover-open');
  await expect(list).toBeVisible();
  await expectMotionSettled(page);
  return {
    list: await box(list),
    field: await box(field),
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

    test.describe('from a field at the column end', () => {
      test.use({ storageState: TTS_READY_STATE });

      test('stays inside the column and the screen @mobile', async ({ page }) => {
        await stubOpenRouter(page);
        await page.goto('./#/settings');
        const placed = await openDropdown(page, page.getByTestId('tts-pace-select'));

        expectInside(placed, page);
        // Growing from the field's start edge would leave the column, so it ends at the field's end.
        expect(placed.list.right).toBeCloseTo(placed.field.right, 0);
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
