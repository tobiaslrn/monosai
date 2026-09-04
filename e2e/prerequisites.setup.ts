import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { test, type Page } from '@playwright/test';
import {
  buildSnapshot,
  configureTextModel,
  configureTts,
  stubReviewedCollection,
} from './generation';
import { stubOpenRouter } from './openrouter';
import {
  GENERATION_READY_STATE,
  INTRO_SEEN_STATE,
  TEXT_MODEL_READY_STATE,
  TTS_READY_STATE,
} from './state';
import { expectSettingPersisted } from './storage';

test.beforeEach(async ({ page }) => {
  await page.goto('./#/library');
  await page.getByRole('button', { name: 'Got it' }).click();
  await expectSettingPersisted(page, 'app', 'helpIntroSeen', true);
});

test('creates a state with the first-use introduction dismissed @smoke', async ({ page }) => {
  await saveIndexedDbState(page, INTRO_SEEN_STATE);
});

async function saveIndexedDbState(page: Page, statePath: string): Promise<void> {
  await mkdir(path.dirname(statePath), { recursive: true });
  await page.context().storageState({ path: statePath, indexedDB: true });
}

test('creates a tested text-model state @smoke', async ({ page }) => {
  await stubOpenRouter(page);
  await configureTextModel(page);
  await saveIndexedDbState(page, TEXT_MODEL_READY_STATE);
});

test('creates a tested text-and-speech-model state @smoke', async ({ page }) => {
  await stubOpenRouter(page);
  await configureTextModel(page);
  await configureTts(page);
  await saveIndexedDbState(page, TTS_READY_STATE);
});

test('creates a generation-ready model and vocabulary state @smoke', async ({ page }) => {
  await stubOpenRouter(page);
  await stubReviewedCollection(page);
  await configureTextModel(page);
  await buildSnapshot(page);
  await saveIndexedDbState(page, GENERATION_READY_STATE);
});
