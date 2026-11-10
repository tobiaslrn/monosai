import { expect, type Locator } from '@playwright/test';

/**
 * Chooses an option of the app's select: it opens the combobox and clicks the
 * option carrying `value`, the way `selectOption` named it on a native select.
 * The list is the one the combobox controls, so two selects on a page never
 * answer for each other.
 */
export async function chooseOption(select: Locator, value: string): Promise<void> {
  await select.click();
  const listbox = select
    .page()
    .locator(`[id="${(await select.getAttribute('aria-controls')) ?? ''}"]`);
  await listbox.locator(`[role="option"][data-value="${value}"]`).click();
  await expect(select).toHaveAttribute('aria-expanded', 'false');
}

/** The combobox shows the option with this label. */
export async function expectChosen(select: Locator, label: string): Promise<void> {
  await expect(select).toHaveText(label);
}
