import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fixedClock } from '../../../domain/shared/clock';
import {
  DEFAULT_STORY_TOKEN_BUDGET,
  DEFAULT_READER_PREFERENCES,
  DEFAULT_GENERATION_SETTINGS,
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
    expect(app.ok && app.value.ankiConnectPort).toBe(8_765);
    expect(app.ok && app.value.ankiWordPriorityMode).toBe('uniform');
    expect(preferences.ok && preferences.value).toEqual(DEFAULT_READER_PREFERENCES);

    const textModel = await repository.getTextModelSettings();
    expect(textModel.ok && textModel.value.storyTokenBudget).toBe(DEFAULT_STORY_TOKEN_BUDGET);

    const generation = await repository.getGenerationSettings();
    expect(generation.ok && generation.value).toEqual(DEFAULT_GENERATION_SETTINGS);
  });

  it('persists a valid AnkiConnect port and rejects an invalid one', async () => {
    const saved = await repository.updateAppSettings({ ankiConnectPort: 9_999 });
    expect(saved.ok && saved.value.ankiConnectPort).toBe(9_999);

    const invalid = await repository.updateAppSettings({ ankiConnectPort: 70_000 });
    expect(invalid.ok).toBe(false);
    const reloaded = await repository.getAppSettings();
    expect(reloaded.ok && reloaded.value.ankiConnectPort).toBe(9_999);
  });

  it('round-trips the Anki word-priority mode immediately', async () => {
    const saved = await repository.updateAppSettings({ ankiWordPriorityMode: 'difficult' });

    expect(saved.ok && saved.value.ankiWordPriorityMode).toBe('difficult');
    const reloaded = await repository.getAppSettings();
    expect(reloaded.ok && reloaded.value.ankiWordPriorityMode).toBe('difficult');
  });

  it('stores generation strictness in its own settings row', async () => {
    const saved = await repository.updateGenerationSettings({ vocabularyStrictness: 'strict' });

    expect(saved.ok && saved.value.vocabularyStrictness).toBe('strict');
    const row = await db.settings.get(SETTINGS_KEYS.generation);
    expect(row?.value).toMatchObject({
      vocabularyStrictness: 'strict',
      defaultPreparationTargets: ['english', 'grammar'],
    });
  });

  it('rejects duplicate preparation targets without writing them', async () => {
    const invalid = await repository.updateGenerationSettings({
      defaultPreparationTargets: ['english', 'english'],
    });

    expect(invalid.ok).toBe(false);
    expect(await db.settings.get(SETTINGS_KEYS.generation)).toBeUndefined();
  });

  it('defaults the priority mode when reading an older app row', async () => {
    await db.settings.put({
      key: SETTINGS_KEYS.app,
      v: ROW_VERSION,
      value: {
        theme: 'system',
        activeSnapshotId: null,
        ankiConnectPort: 8_765,
        updatedAt: 0,
      },
    });

    const loaded = await repository.getAppSettings();

    expect(loaded.ok && loaded.value.ankiWordPriorityMode).toBe('uniform');
  });

  it('starts every reader aid enabled, at unscaled text', async () => {
    const preferences = await repository.getReaderPreferences();

    expect(preferences.ok).toBe(true);
    if (!preferences.ok) {
      return;
    }
    expect(preferences.value.furigana).toBe(true);
    expect(preferences.value.tokenSpacing).toBe(true);
    expect(preferences.value.warningMarkers).toBe(true);
    expect(preferences.value.textScale).toBe(1);
  });

  it('rejects a text scale outside the usable range rather than storing it', async () => {
    const updated = await repository.updateReaderPreferences({ textScale: 12 });

    expect(updated.ok).toBe(false);

    const reloaded = await repository.getReaderPreferences();
    expect(reloaded.ok && reloaded.value.textScale).toBe(1);
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

  it('rejects a story token budget outside its safe range', async () => {
    const invalid = await repository.updateTextModelSettings({ storyTokenBudget: 1_024 });

    expect(invalid.ok).toBe(false);

    const loaded = await repository.getTextModelSettings();
    expect(loaded.ok && loaded.value.storyTokenBudget).toBe(DEFAULT_STORY_TOKEN_BUDGET);
  });

  it('keeps both patches when two updates to one row overlap', async () => {
    // Each patch describes a different field, and neither may be lost: the
    // settings page fires exactly this pair when a model is chosen while the
    // learner is editing another field, and the model choice used to vanish.
    const [route, budget] = await Promise.all([
      repository.updateTextModelSettings({ translationPresetId: 'task-translation' }),
      repository.updateTextModelSettings({ storyTokenBudget: 20_000 }),
    ]);

    expect(route.ok && budget.ok).toBe(true);
    const loaded = await repository.getTextModelSettings();
    expect(loaded.ok && loaded.value.translationPresetId).toBe('task-translation');
    expect(loaded.ok && loaded.value.storyTokenBudget).toBe(20_000);
  });

  it('leaves the stored row untouched when an overlapping update is invalid', async () => {
    const [valid, invalid] = await Promise.all([
      repository.updateTextModelSettings({ modelId: 'vendor/model' }),
      repository.updateTextModelSettings({ storyTokenBudget: 1_024 }),
    ]);

    expect(valid.ok).toBe(true);
    expect(invalid.ok).toBe(false);
    const loaded = await repository.getTextModelSettings();
    expect(loaded.ok && loaded.value.modelId).toBe('vendor/model');
    expect(loaded.ok && loaded.value.storyTokenBudget).toBe(DEFAULT_STORY_TOKEN_BUDGET);
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
    expect(loaded.value.storyTokenBudget).toBe(DEFAULT_STORY_TOKEN_BUDGET);
  });
});
