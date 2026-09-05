import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  FakeCredentialRepository,
  modelTest,
  StubAiSettingsRepository,
  StubTextProvider,
} from '../../../testing/ai-fakes';
import { FAKE_OPENROUTER } from '../../../testing/openrouter-server';
import { aiError } from '../../domain/ai/ai-error';
import { fixedClock } from '../../domain/shared/clock';
import type { Hasher } from '../../domain/shared/hashing';
import { ok } from '../../domain/shared/result';
import { storageError } from '../../domain/storage/storage-error';
import {
  DEFAULT_STORY_TOKEN_BUDGET,
  MAX_STORY_TOKEN_BUDGET,
  MIN_STORY_TOKEN_BUDGET,
} from '../../domain/settings/settings';
import { TEXT_GENERATION_PROVIDER } from '../shared/ai-tokens';
import {
  CLOCK,
  CREDENTIAL_REPOSITORY,
  HASHER,
  SETTINGS_REPOSITORY,
} from '../shared/repository-tokens';
import { CredentialStore } from './credential.store';
import { TextModelStore } from './text-model.store';

const HASH: Hasher = { algorithm: 'test', hashText: (text) => `h(${text})` };
const MODEL = FAKE_OPENROUTER.textModel;

describe('TextModelStore', () => {
  let settings: StubAiSettingsRepository;
  let credentials: FakeCredentialRepository;
  let provider: StubTextProvider;

  beforeEach(() => {
    settings = new StubAiSettingsRepository();
    credentials = new FakeCredentialRepository();
    provider = new StubTextProvider(ok(modelTest(MODEL)));

    TestBed.configureTestingModule({
      providers: [
        TextModelStore,
        CredentialStore,
        { provide: SETTINGS_REPOSITORY, useValue: settings },
        { provide: CREDENTIAL_REPOSITORY, useValue: credentials },
        { provide: TEXT_GENERATION_PROVIDER, useValue: provider },
        { provide: HASHER, useValue: HASH },
        { provide: CLOCK, useValue: fixedClock(1_700_000_000_000) },
      ],
    });
  });

  async function ready(): Promise<TextModelStore> {
    const credential = TestBed.inject(CredentialStore);
    await credential.load();
    const store = TestBed.inject(TextModelStore);
    await store.load();
    return store;
  }

  describe('readiness', () => {
    it('retains a failed test in a new store and forgets it after a successful retry', async () => {
      const store = await ready();
      store.setDraftModelId(MODEL);
      provider.result = {
        ok: false,
        error: aiError('authentication', 'text-model-test', 'The provider rejected the saved key.'),
      };
      await store.test();
      const reloaded = TestBed.runInInjectionContext(() => new TextModelStore());
      await reloaded.load();
      expect(reloaded.readiness()).toBe('failed');
      expect(reloaded.testFailure()?.message).toContain('rejected the saved key');
      provider.result = ok(modelTest(MODEL));
      await reloaded.test();
      expect(reloaded.readiness()).toBe('ready');
      expect(settings.textModel.failedTests).toEqual([]);
    });

    it('is not configured on a fresh install', async () => {
      const store = await ready();

      expect(store.readiness()).toBe('incomplete');
      expect(provider.calls).toBe(0);
    });

    it('is not configured while no key is saved, even with a model', async () => {
      await credentials.remove();
      const store = await ready();
      store.setDraftModelId(MODEL);
      await store.save();

      expect(store.readiness()).toBe('no-credential');
    });

    it('is untested once a model is saved', async () => {
      const store = await ready();

      store.setDraftModelId(MODEL);
      await store.save();

      expect(store.readiness()).toBe('untested');
    });

    it('is ready after a passing test', async () => {
      const store = await ready();
      store.setDraftModelId(MODEL);

      await store.test();

      expect(store.readiness()).toBe('ready');
      expect(store.structuredOutput()).toBe('native-schema');
      expect(settings.textModel.lastTestedAt).toBe(1_700_000_000_000);
    });

    it('goes stale when the model changes', async () => {
      const store = await ready();
      store.setDraftModelId(MODEL);
      await store.test();

      store.setDraftModelId('vendor/other');
      await store.save();

      expect(store.readiness()).toBe('stale');
      expect(settings.textModel.lastTestFingerprint).not.toBeNull();
    });

    it('goes stale when the key is replaced, without erasing the old result', async () => {
      const store = await ready();
      store.setDraftModelId(MODEL);
      await store.test();
      const fingerprint = settings.textModel.lastTestFingerprint;

      await TestBed.inject(CredentialStore).save('sk-or-v1-replacement');

      expect(store.readiness()).toBe('stale');
      expect(settings.textModel.lastTestFingerprint).toBe(fingerprint);
    });

    it('reads as not configured once the key is removed', async () => {
      const store = await ready();
      store.setDraftModelId(MODEL);
      await store.test();

      await TestBed.inject(CredentialStore).remove();

      expect(store.readiness()).toBe('no-credential');
      expect(settings.textModel.lastTestFingerprint).not.toBeNull();
    });
  });

  describe('test', () => {
    it('saves the field before testing, so the result describes what is stored', async () => {
      const store = await ready();

      store.setDraftModelId('  vendor/text-model  ');
      await store.test();

      expect(settings.textModel.modelId).toBe(MODEL);
      expect(store.hasUnsavedModelId()).toBe(false);
    });

    it('makes no request when no model is given', async () => {
      const store = await ready();

      await store.test();

      expect(provider.calls).toBe(0);
    });

    it('records a provider failure and reads as failed', async () => {
      provider.result = {
        ok: false,
        error: aiError('authentication', 'text-model-test', 'rejected'),
      };
      const store = await ready();
      store.setDraftModelId(MODEL);

      await store.test();

      expect(store.readiness()).toBe('failed');
      expect(store.testFailure()?.code).toBe('authentication');
      expect(settings.textModel.lastTestFingerprint).toBeNull();
    });

    it('clears a previous failure when the model is changed', async () => {
      provider.result = {
        ok: false,
        error: aiError('model-not-found', 'text-model-test', 'absent'),
      };
      const store = await ready();
      store.setDraftModelId('vendor/absent');
      await store.test();

      store.setDraftModelId(MODEL);
      await store.save();

      expect(store.testFailure()).toBeNull();
      expect(store.readiness()).toBe('untested');
    });

    it('returns to idle after cancellation and records nothing', async () => {
      const store = await ready();
      store.setDraftModelId(MODEL);
      const pending = store.test();
      store.cancelTest();
      await pending;

      expect(store.action()).toBe('idle');
      expect(store.readiness()).toBe('untested');
      expect(store.testFailure()).toBeNull();
    });

    it('surfaces a failure to store the passing result', async () => {
      const store = await ready();
      store.setDraftModelId(MODEL);
      await store.save();
      settings.failWrites = storageError('quota', 'no room');

      await store.test();

      expect(store.storageFailure()?.code).toBe('quota');
      expect(store.readiness()).toBe('untested');
    });
  });

  describe('save', () => {
    it('loads the default story token budget and persists a valid change', async () => {
      const store = await ready();

      expect(store.storyTokenBudgetDraft()).toBe(String(DEFAULT_STORY_TOKEN_BUDGET));
      expect(store.isStoryTokenBudgetValid()).toBe(true);

      store.setStoryTokenBudgetDraft(String(MIN_STORY_TOKEN_BUDGET));
      await expect(store.saveStoryTokenBudget()).resolves.toBe(true);

      expect(settings.textModel.storyTokenBudget).toBe(MIN_STORY_TOKEN_BUDGET);
      expect(store.hasUnsavedStoryTokenBudget()).toBe(false);
    });

    it('does not persist an invalid story token budget', async () => {
      const store = await ready();

      store.setStoryTokenBudgetDraft(String(MAX_STORY_TOKEN_BUDGET + 1));

      expect(store.isStoryTokenBudgetValid()).toBe(false);
      await expect(store.saveStoryTokenBudget()).resolves.toBe(false);
      expect(settings.textModel.storyTokenBudget).toBe(DEFAULT_STORY_TOKEN_BUDGET);
    });

    it('registers and selects presets with their reasoning effort', async () => {
      const store = await ready();

      await store.registerPreset({
        id: 'gemini-flash',
        name: 'Gemini Flash',
        modelId: 'google/gemini-flash',
        reasoningEffort: 'low',
      });

      expect(store.activePresetId()).toBeNull();
      expect(settings.textModel).toMatchObject({
        modelId: '',
        activePresetId: null,
      });
      expect(store.readiness()).toBe('incomplete');
    });

    it('removes a default without silently choosing a replacement', async () => {
      const store = await ready();
      await store.registerPreset({
        id: 'first',
        name: 'First',
        modelId: 'vendor/first',
        reasoningEffort: null,
      });
      await store.registerPreset({
        id: 'second',
        name: 'Second',
        modelId: 'vendor/second',
        reasoningEffort: 'low',
      });
      await store.testPreset('second');

      await store.removePreset('second');

      expect(store.presets().map((preset) => preset.id)).toEqual(['first']);
      expect(settings.textModel).toMatchObject({
        activePresetId: null,
        modelId: '',
      });
      expect(store.readiness()).toBe('incomplete');
    });

    it('keeps compatibility evidence on the tested preset', async () => {
      const store = await ready();
      await store.registerPreset({
        id: 'story',
        name: 'Story',
        modelId: MODEL,
        reasoningEffort: null,
      });

      await store.testPreset('story');

      expect(store.compatiblePresets().map((preset) => preset.id)).toEqual(['story']);
      expect(store.configForPreset('story')).toMatchObject({
        modelId: MODEL,
        structuredOutput: 'native-schema',
      });
    });

    it('keeps independently tested translation and grammar routes without changing Story', async () => {
      const store = await ready();
      store.setDraftModelId(MODEL);
      await store.test();

      await store.setTaskModel('translation', {
        modelId: 'vendor/translator',
        name: 'Translator',
        reasoningEffort: 'low',
      });
      await store.setTaskModel('grammar', {
        modelId: 'vendor/grammar',
        name: 'Grammar',
        reasoningEffort: null,
      });

      expect(store.routeReadiness('translation')).toBe('untested');
      await store.testTask('translation');
      await store.testTask('grammar');

      expect(store.configForTask('text')?.modelId).toBe(MODEL);
      expect(store.configForTask('translation')?.modelId).toBe('vendor/translator');
      expect(store.configForTask('grammar')?.modelId).toBe('vendor/grammar');
      expect(settings.textModel.modelId).toBe(MODEL);
    });

    it('gives a routed task its own generation limit and leaves the rest alone', async () => {
      const store = await ready();
      store.setDraftModelId(MODEL);
      await store.test();
      await store.setTaskModel('translation', {
        modelId: 'vendor/translator',
        name: 'Translator',
        reasoningEffort: null,
      });
      await store.testTask('translation');

      expect(store.routeTokenBudget('translation')).toBe(DEFAULT_STORY_TOKEN_BUDGET);
      await expect(store.setTaskTokenBudget('translation', MIN_STORY_TOKEN_BUDGET)).resolves.toBe(
        true,
      );

      expect(store.routeTokenBudget('translation')).toBe(MIN_STORY_TOKEN_BUDGET);
      expect(store.configForTask('translation')?.storyTokenBudget).toBe(MIN_STORY_TOKEN_BUDGET);
      expect(store.configForTask('grammar')?.storyTokenBudget).toBe(DEFAULT_STORY_TOKEN_BUDGET);
      expect(store.settings().storyTokenBudget).toBe(DEFAULT_STORY_TOKEN_BUDGET);
      // A budget says nothing about compatibility, so the test still vouches.
      expect(store.routeReadiness('translation')).toBe('ready');
    });

    it('refuses a routed limit outside the allowed range', async () => {
      const store = await ready();
      store.setDraftModelId(MODEL);
      await store.test();
      await store.setTaskModel('grammar', {
        modelId: 'vendor/grammar',
        name: 'Grammar',
        reasoningEffort: null,
      });

      await expect(store.setTaskTokenBudget('grammar', MAX_STORY_TOKEN_BUDGET + 1)).resolves.toBe(
        false,
      );
      await expect(store.setTaskTokenBudget('grammar', MIN_STORY_TOKEN_BUDGET - 1)).resolves.toBe(
        false,
      );

      expect(store.routeTokenBudget('grammar')).toBe(DEFAULT_STORY_TOKEN_BUDGET);
    });

    it('has no routed limit to set while the task follows the story model', async () => {
      const store = await ready();

      await expect(store.setTaskTokenBudget('translation', MIN_STORY_TOKEN_BUDGET)).resolves.toBe(
        false,
      );
      expect(store.routeTokenBudget('translation')).toBe(DEFAULT_STORY_TOKEN_BUDGET);
    });

    it('reverts nothing and reports a storage failure', async () => {
      const store = await ready();
      settings.failWrites = storageError('unavailable', 'closed');

      store.setDraftModelId(MODEL);
      await expect(store.save()).resolves.toBe(false);

      expect(settings.textModel.modelId).toBe('');
      expect(store.storageFailure()?.code).toBe('unavailable');
    });

    it('does not write when the field is unchanged', async () => {
      const store = await ready();
      store.setDraftModelId(MODEL);
      await store.save();
      settings.failWrites = storageError('unavailable', 'closed');

      await expect(store.save()).resolves.toBe(true);
    });
  });
});
