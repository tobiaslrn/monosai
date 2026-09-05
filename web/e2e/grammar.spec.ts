import { expect, test, type Page } from '@playwright/test';
import { expectNoSeriousAccessibilityViolations } from './accessibility';

const STARTER = 'Starter forms';
const EVERYDAY = 'Everyday forms';

/** The picker only exists once the bundled presets have been verified and loaded. */
async function openGrammar(page: Page): Promise<void> {
  await page.goto('./#/reading-level');
  await expect(page.getByRole('radio', { name: new RegExp(STARTER) })).toBeVisible();
}

/**
 * Register and the wording escape hatch are set once and then left alone, so
 * they live behind a disclosure that names its current value.
 */
async function openWording(page: Page): Promise<void> {
  await page.locator('#wording > summary').click();
  await expect(page.locator('#wording')).toHaveAttribute('open', /.*/);
}

test.describe('grammar profile', () => {
  test('starts a fresh install on the easiest preset @mobile', async ({ page }) => {
    await openGrammar(page);

    await expect(page.getByRole('radio', { name: new RegExp(STARTER) })).toBeChecked();
    await expect(page.getByRole('radiogroup', { name: 'Reading level' })).toBeVisible();

    // A closed disclosure still answers the question it is hiding.
    await expect(page.locator('#wording .summary-value')).toHaveText('Either');
    await openWording(page);
    await expect(page.getByRole('radio', { name: 'Either' })).toBeChecked();

    await expectNoSeriousAccessibilityViolations(page);
  });

  test('remembers the chosen preset across a reload and says what changed @smoke', async ({
    page,
  }) => {
    await openGrammar(page);

    await page.getByRole('radio', { name: new RegExp(EVERYDAY) }).check();

    await expect(page.getByTestId('grammar-confirmation')).toContainText(EVERYDAY);
    await expect(page.getByTestId('grammar-confirmation')).toContainText('out of date');

    await page.reload();

    await expect(page.getByRole('radio', { name: new RegExp(EVERYDAY) })).toBeChecked();
    // The confirmation reports a change the learner just made, not a stored state.
    await expect(page.getByTestId('grammar-confirmation')).toBeEmpty();
  });

  test('keeps custom wording across a reload and restores the preset on reset', async ({
    page,
  }) => {
    await openGrammar(page);
    await openWording(page);
    const guidance = page.locator('mn-guidance-section .guidance');
    const presetWording = (await guidance.textContent())?.trim() ?? '';

    await page.getByRole('button', { name: 'Use my own wording' }).click();
    await page.locator('mn-guidance-section textarea').fill('Only very short sentences.');
    await page.getByRole('button', { name: 'Save wording' }).click();

    await expect(guidance).toHaveText('Only very short sentences.');

    await page.reload();

    await openWording(page);
    await expect(guidance).toHaveText('Only very short sentences.');
    await page.getByRole('button', { name: 'Reset to preset' }).click();

    await expect(guidance).toHaveText(presetWording);
    await expect(page.getByRole('button', { name: 'Reset to preset' })).toHaveCount(0);
  });

  test('publishes the always-known forms as a read-only list', async ({ page }) => {
    await openGrammar(page);
    const forms = page.locator('#forms');
    const section = page.locator('mn-structural-baseline-section');

    // Collapsed on arrival: 177 entries must not push the picker off the screen.
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

  test('moves through the ladder with arrow keys and selects without a mouse', async ({ page }) => {
    await openGrammar(page);

    await page.getByRole('radio', { name: new RegExp(STARTER) }).focus();
    await page.keyboard.press('ArrowDown');

    await expect(page.getByRole('radio', { name: /Basic forms/ })).toBeFocused();
    await expect(page.getByRole('radio', { name: /Basic forms/ })).toBeChecked();

    await page.keyboard.press('ArrowDown');

    await expect(page.getByRole('radio', { name: new RegExp(EVERYDAY) })).toBeChecked();
    await expect(page.getByTestId('grammar-confirmation')).toContainText(EVERYDAY);

    await page.reload();
    await expect(page.getByRole('radio', { name: new RegExp(EVERYDAY) })).toBeChecked();
  });
});
