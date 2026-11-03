import { expect, test } from '@playwright/test';
import { connectAnki, openVocabulary, refuseAnkiConnect, stubAndroidBridge } from './anki';
import { expectNoSeriousAccessibilityViolations } from './accessibility';

/**
 * The bridge is the Android adapter behind the one Anki entry, so these
 * journeys only exist on the Android project: on a desktop the same entry
 * reaches AnkiConnect instead, and there is no second row to choose.
 */
function androidOnly(): void {
  test.skip(
    test.info().project.name !== 'android-chrome',
    'the bridge is only reachable from Android',
  );
}

test('connects, persists and refreshes the Android provider @smoke @mobile', async ({ page }) => {
  androidOnly();
  await stubAndroidBridge(page);
  await openVocabulary(page);
  await connectAnki(page);
  await expect(page.getByRole('region', { name: 'Review Anki source' })).toContainText('ねこ');
  await page.getByRole('button', { name: 'Confirm vocabulary', exact: true }).click();
  await expect(page.getByTestId('words-standing')).toHaveText('1 word');

  const row = page.getByTestId('source-row').filter({ hasText: 'Anki' });
  await expect(row).toHaveCount(1);
  await page.reload();
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('On this device');

  await row.click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Anki');

  await page.getByTestId('sync-now').click();
  await page.goBack();
  await expect(page.getByTestId('words-standing')).toHaveText('1 word');

  await page.unrouteAll({ behavior: 'wait' });
  await refuseAnkiConnect(page);
  await row.click();
  await page.getByTestId('sync-now').click();
  await expect(page.getByTestId('source-attention')).toContainText(
    'bridge does not appear to be running',
  );
  await page.goBack();
  await expect(page.getByTestId('words-standing')).toHaveText('1 word');
});

test('says what to install when the bridge is not running @smoke @mobile', async ({ page }) => {
  androidOnly();
  await refuseAnkiConnect(page);
  await openVocabulary(page);

  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    await connectAnki(page);
    const dialog = page.getByRole('dialog', { name: 'Add words' });
    const failure = page.getByTestId('anki-connect-failed');
    await expect(failure).toBeVisible({ timeout: 30_000 });
    await expect(failure).toContainText('bridge is not running');
    await expect(failure.getByRole('link', { name: /Download the app/ })).toBeVisible();
    await expect(failure.getByRole('link', { name: /see the source/ })).toBeVisible();
    await expect(failure).toContainText('anki/bridge-not-running');
    // No port on Android: the bridge fixes its own, so offering one is a dead end.
    await expect(page.getByTestId('anki-connect-port')).toHaveCount(0);

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await expectNoSeriousAccessibilityViolations(page);
    await page.screenshot({
      path: `test-results/bridge-${test.info().project.name}-${colorScheme}.png`,
    });

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('add-words')).toBeFocused();
  }
});
