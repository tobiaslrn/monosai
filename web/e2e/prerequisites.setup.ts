import { test } from '@playwright/test';
import { dismissFirstUse, saveIndexedDbState } from './first-use';
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

test.beforeEach(async ({ page }) => {
  await dismissFirstUse(page);
});

test('creates a state with the first-use introduction dismissed @smoke', async ({ page }) => {
  await saveIndexedDbState(page, INTRO_SEEN_STATE);
});

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
