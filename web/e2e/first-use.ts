import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { expectSettingPersisted } from './storage';

/**
 * Answers the two things a first visit shows once: the alpha notice and the
 * offer of Help. Settings rather than the Library: an empty Library's first
 * steps carry the guide themselves and take the place of the offer this
 * dismisses.
 */
export async function dismissFirstUse(page: Page): Promise<void> {
  await page.goto('./#/settings');
  await page
    .getByRole('alertdialog', { name: 'Monosai is in alpha' })
    .getByRole('button', {
      name: 'Continue',
    })
    .click();
  await expectSettingPersisted(page, 'app', 'alphaNoticeSeen', true);
  await page.getByRole('button', { name: 'Dismiss' }).click();
  await expectSettingPersisted(page, 'app', 'helpIntroSeen', true);
}

/** Saves the page's storage, IndexedDB included, for later tests to start from. */
export async function saveIndexedDbState(page: Page, statePath: string): Promise<void> {
  await mkdir(path.dirname(statePath), { recursive: true });
  await page.context().storageState({ path: statePath, indexedDB: true });
}
