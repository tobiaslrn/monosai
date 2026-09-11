import { expect, test, type Page } from '@playwright/test';
import { expectNoSeriousAccessibilityViolations } from './accessibility';

const STARTER = 'Starter forms';
const EVERYDAY = 'Everyday forms';

/** The ladder only exists once the bundled presets have been verified and loaded. */
async function openLadder(page: Page): Promise<void> {
  await page.goto('./#/reading-level/level');
  await expect(page.getByRole('radio', { name: new RegExp(STARTER) })).toBeVisible();
}

/** The overview shows the level's example once the bundle has arrived. */
async function openOverview(page: Page): Promise<void> {
  await page.goto('./#/reading-level');
  await expect(page.locator('mn-reading-level-page .example-ja')).toBeVisible();
}

async function backToOverview(page: Page): Promise<void> {
  await page
    .getByRole('button', { name: 'Back to words and level' })
    .or(page.getByRole('link', { name: 'Back to words and level' }))
    .click();
  await expect(page.getByRole('heading', { name: 'Words and level', level: 1 })).toBeVisible();
}

test.describe('grammar profile', () => {
  test('starts a fresh install on the easiest preset @mobile', async ({ page }) => {
    await openLadder(page);

    await expect(page.getByRole('radio', { name: new RegExp(STARTER) })).toBeChecked();
    await expect(page.getByRole('radiogroup', { name: 'Reading level' })).toBeVisible();
    await expectNoSeriousAccessibilityViolations(page);

    await openOverview(page);
    await expect(page.getByTestId('grammar-standing')).toHaveText(STARTER);
    // Every register is allowed, so there is nothing to choose between.
    await expect(page.locator('#wording')).toHaveCount(0);

    await expectNoSeriousAccessibilityViolations(page);
  });

  test('saves a chosen level only when asked and says what changed @smoke', async ({ page }) => {
    await openOverview(page);
    const confirmation = page.getByTestId('grammar-confirmation');

    // Reading another level's example and leaving changes nothing.
    await page.getByTestId('reading-level-link').click();
    await expect(page.getByRole('heading', { name: 'Reading level', level: 1 })).toBeVisible();
    await page.getByRole('radio', { name: new RegExp(EVERYDAY) }).check();
    await backToOverview(page);
    await expect(page.getByTestId('grammar-standing')).toHaveText(STARTER);
    await expect(confirmation).toBeEmpty();

    await page.getByTestId('reading-level-link').click();
    await page.getByRole('radio', { name: new RegExp(EVERYDAY) }).check();
    await page.getByTestId('save-level').click();

    await expect(page).toHaveURL(/#\/reading-level$/);
    await expect(page.getByTestId('grammar-standing')).toHaveText(EVERYDAY);
    await expect(confirmation).toContainText(EVERYDAY);
    await expect(confirmation).toContainText('out of date');

    await page.reload();

    await expect(page.getByTestId('grammar-standing')).toHaveText(EVERYDAY);
    // The confirmation reports a change the learner just made, not a stored state.
    await expect(confirmation).toBeEmpty();
    await openLadder(page);
    await expect(page.getByRole('radio', { name: new RegExp(EVERYDAY) })).toBeChecked();
  });

  test('publishes the always-known forms as a read-only list', async ({ page }) => {
    await openOverview(page);
    const forms = page.locator('#forms');
    const section = page.locator('mn-structural-baseline-section');

    // Collapsed on arrival: 177 entries must not push the level off the screen.
    await expect(forms).not.toHaveAttribute('open', /.*/);
    await expect(forms.locator('.summary-value')).toHaveText('9 categories');
    await expect(section.locator('.entry').first()).toBeHidden();

    await forms.locator('> summary').click();

    await expect(section.locator('.entry').first()).toBeVisible();
    await expect(section.getByRole('heading', { name: /Particles/ })).toBeVisible();
    await expect(section.locator('.entry')).toHaveCount(177);
    await expect(section.locator('input, textarea, button')).toHaveCount(0);

    await expectNoSeriousAccessibilityViolations(page);
  });
});

test.describe('grammar profile keyboard access', () => {
  // Touch devices have no roving tabindex to traverse.
  test.skip(({ isMobile }) => isMobile, 'keyboard-only traversal is a desktop concern');

  test('moves through the ladder with arrow keys and saves without a mouse', async ({ page }) => {
    await openLadder(page);

    await page.getByRole('radio', { name: new RegExp(STARTER) }).focus();
    await page.keyboard.press('ArrowDown');

    await expect(page.getByRole('radio', { name: /Basic forms/ })).toBeFocused();
    await expect(page.getByRole('radio', { name: /Basic forms/ })).toBeChecked();

    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('radio', { name: new RegExp(EVERYDAY) })).toBeChecked();

    await page.getByTestId('save-level').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('grammar-confirmation')).toContainText(EVERYDAY);

    await openLadder(page);
    await expect(page.getByRole('radio', { name: new RegExp(EVERYDAY) })).toBeChecked();
  });
});
