import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fixedClock } from '../../../domain/shared/clock';
import {
  DEFAULT_READER_PREFERENCES,
  DEFAULT_TEXT_MODEL_SETTINGS,
} from '../../../domain/settings/settings';
import { createTestDatabase, destroyTestDatabase } from '../../../../testing/test-database';
import type { MonosaiDatabase } from '../monosai-db';
import { DexieSettingsRepository } from './dexie-settings.repository';
import { SETTINGS_KEYS } from '../schemas/settings.schema';
import { ROW_VERSION } from '../schemas/common.schema';

describe('DexieSettingsRepository', () => {
  let db: MonosaiDatabase;
  let repository: DexieSettingsRepository;

  beforeEach(async () => {
    db = await createTestDatabase();
    repository = new DexieSettingsRepository(db, fixedClock(1_700_200_000_000));
  });

  afterEach(async () => {
    await destroyTestDatabase(db);
  });

  it('returns documented defaults on a fresh install', async () => {
    const app = await repository.getAppSettings();
    const preferences = await repository.getReaderPreferences();

    expect(app.ok && app.value.theme).toBe('system');
    expect(app.ok && app.value.activeSnapshotId).toBeNull();
    expect(preferences.ok && preferences.value).toEqual(DEFAULT_READER_PREFERENCES);
  });

  it('starts every reader aid enabled', async () => {
    const preferences = await repository.getReaderPreferences();

    expect(preferences.ok).toBe(true);
    if (!preferences.ok) {
      return;
    }
    expect(preferences.value.furigana).toBe(true);
    expect(preferences.value.tokenSpacing).toBe(true);
    expect(preferences.value.statusMarkers).toBe(true);
    expect(preferences.value.translationsExpanded).toBe(true);
  });

  it('persists a partial update and stamps the change time', async () => {
    const updated = await repository.updateReaderPreferences({ furigana: false });

    expect(updated.ok).toBe(true);
    if (!updated.ok) {
      return;
    }
    expect(updated.value.furigana).toBe(false);
    expect(updated.value.tokenSpacing).toBe(true);
    expect(updated.value.updatedAt).toBe(1_700_200_000_000);

    const reloaded = await repository.getReaderPreferences();
    expect(reloaded.ok && reloaded.value.furigana).toBe(false);
  });

  it('keeps settings concerns independent', async () => {
    await repository.updateAppSettings({ theme: 'dark' });
    await repository.updateTextModelSettings({ modelId: 'vendor/model-1' });

    const app = await repository.getAppSettings();
    const model = await repository.getTextModelSettings();

    expect(app.ok && app.value.theme).toBe('dark');
    expect(model.ok && model.value.modelId).toBe('vendor/model-1');
    expect(model.ok && model.value.lastTestFingerprint).toBe(
      DEFAULT_TEXT_MODEL_SETTINGS.lastTestFingerprint,
    );
  });

  it('reports a corrupt settings row instead of silently resetting it', async () => {
    await db.settings.put({
      key: SETTINGS_KEYS.readerPreferences,
      v: ROW_VERSION,
      value: { furigana: 'yes' },
    });

    const loaded = await repository.getReaderPreferences();

    expect(loaded.ok).toBe(false);
    if (loaded.ok) {
      return;
    }
    expect(loaded.error.code).toBe('corrupt-record');
  });

  it('rejects an invalid update before writing it', async () => {
    const invalid = await repository.updateTtsSettings({ speed: -1 });

    expect(invalid.ok).toBe(false);
    expect(await db.settings.get(SETTINGS_KEYS.tts)).toBeUndefined();
  });

  it('stores the exception policy with its hash', async () => {
    const saved = await repository.updateExceptionPolicy({
      text: 'Allow common katakana loanwords.',
      policyHash: 'hash-1',
      updatedAt: 0,
    });

    expect(saved.ok && saved.value.policyHash).toBe('hash-1');
    const reloaded = await repository.getExceptionPolicy();
    expect(reloaded.ok && reloaded.value.text).toBe('Allow common katakana loanwords.');
  });

  it('records active language asset versions', async () => {
    await repository.updateLanguageAssetSettings({ tokenizerVersion: '1.0.0' });

    const loaded = await repository.getLanguageAssetSettings();
    expect(loaded.ok && loaded.value.tokenizerVersion).toBe('1.0.0');
    expect(loaded.ok && loaded.value.dictionaryVersion).toBeNull();
  });

  it('reads a text-model row written before the structured-output field existed', async () => {
    // The field records what a successful test proved; a row that predates it
    // simply has nothing proved yet, which is exactly `null`.
    await db.settings.put({
      key: 'text-model',
      v: ROW_VERSION,
      value: { modelId: 'vendor/model', lastTestFingerprint: 'fp', lastTestedAt: 1 },
    });

    const loaded = await repository.getTextModelSettings();

    expect(loaded.ok).toBe(true);
    if (!loaded.ok) {
      return;
    }
    expect(loaded.value.modelId).toBe('vendor/model');
    expect(loaded.value.structuredOutput).toBeNull();
  });
});
