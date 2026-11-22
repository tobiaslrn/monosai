import { test } from '@playwright/test';
import { dismissFirstUse, saveIndexedDbState } from '../e2e/first-use';
import { SHOTS_STATE } from './shots';

test('answers the first-use notices once for every scenario', async ({ page }) => {
  await dismissFirstUse(page);
  await saveIndexedDbState(page, SHOTS_STATE);
});
