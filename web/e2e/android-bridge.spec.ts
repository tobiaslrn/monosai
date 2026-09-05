import { expect, test } from '@playwright/test';
import { connectAndroidBridge, openVocabulary, refuseAnkiConnect, stubAndroidBridge } from './anki';
import { expectNoSeriousAccessibilityViolations } from './accessibility';

test('connects, persists and refreshes the Android provider @smoke @mobile', async ({ page }) => {
  await stubAndroidBridge(page);
  await openVocabulary(page);
  await connectAndroidBridge(page);
  await expect(page.getByRole('region', { name: 'Review Anki source' })).toContainText('ねこ');
  await page.getByRole('button', { name: 'Confirm vocabulary', exact: true }).click();
  await expect(page.getByTestId('words-standing')).toHaveText('1 word');
  const source = page.locator('li.source').filter({ hasText: 'AnkiDroid bridge' });
  await expect(source).toHaveCount(1);
  await page.reload();
  await expect(source).toHaveCount(1);
  await source.getByTestId('sync-now').click();
  await expect(page.getByTestId('words-standing')).toHaveText('1 word');
  await page.unrouteAll({ behavior: 'wait' });
  await refuseAnkiConnect(page);
  await source.getByTestId('sync-now').click();
  await expect(source).toContainText('bridge-not-running');
  await expect(page.getByTestId('words-standing')).toHaveText('1 word');
});

test('Android setup fits both themes and returns focus @smoke @mobile', async ({ page }) => {
  await openVocabulary(page);
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    await page.getByTestId('add-source').click();
    await page.getByRole('button', { name: 'AnkiDroid bridge', exact: false }).click();
    const dialog = page.getByRole('dialog', { name: 'Add vocabulary source' });
    await expect(dialog).toContainText('AnkiDroid 2.24');
    await expect(dialog.getByRole('button', { name: 'Connect to AnkiDroid' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await expectNoSeriousAccessibilityViolations(page);
    await page.screenshot({
      path: `test-results/bridge-${test.info().project.name}-${colorScheme}.png`,
    });
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('add-source')).toBeFocused();
  }
});
