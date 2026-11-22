import { test } from '@playwright/test';
import { dismissFirstUse, saveIndexedDbState } from '../e2e/first-use';
import { VISUAL_STATE } from './state';

test('answers the first-use notices once for every capture', async ({ page }) => {
  await dismissFirstUse(page);
  await saveIndexedDbState(page, VISUAL_STATE);
});
