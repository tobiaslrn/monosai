import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  FakeCredentialRepository,
  modelTest,
  StubAiSettingsRepository,
  StubTextProvider,
  StubTtsProvider,
  ttsTest,
} from '../../../testing/ai-fakes';
import { FAKE_OPENROUTER } from '../../../testing/openrouter-server';
import { aiError } from '../../domain/ai/ai-error';
import { fixedClock } from '../../domain/shared/clock';
import type { Hasher } from '../../domain/shared/hashing';
import { ok } from '../../domain/shared/result';
import { storageError } from '../../domain/storage/storage-error';
import { TEXT_GENERATION_PROVIDER, TEXT_TO_SPEECH_PROVIDER } from '../shared/ai-tokens';
import {
  CLOCK,
  CREDENTIAL_REPOSITORY,
  HASHER,
  SETTINGS_REPOSITORY,
} from '../shared/repository-tokens';
import { CredentialStore } from './credential.store';
import { TextModelStore } from './text-model.store';
import { TtsStore } from './tts.store';

const HASH: Hasher = { algorithm: 'test', hashText: (text) => `h(${text})` };
const CONFIGURED = {
  modelId: FAKE_OPENROUTER.ttsModel,
  voiceId: FAKE_OPENROUTER.voice,
  speechStyle: 'clear' as const,
};

describe('TtsStore', () => {
  let settings: StubAiSettingsRepository;
  let provider: StubTtsProvider;

  beforeEach(() => {
    settings = new StubAiSettingsRepository();
    provider = new StubTtsProvider(ok(ttsTest()));

    TestBed.configureTestingModule({
      providers: [
        TtsStore,
        TextModelStore,
        CredentialStore,
        { provide: SETTINGS_REPOSITORY, useValue: settings },
        { provide: CREDENTIAL_REPOSITORY, useValue: new FakeCredentialRepository() },
        { provide: TEXT_TO_SPEECH_PROVIDER, useValue: provider },
        {
          provide: TEXT_GENERATION_PROVIDER,
          useValue: new StubTextProvider(ok(modelTest())),
        },
        { provide: HASHER, useValue: HASH },
        { provide: CLOCK, useValue: fixedClock(1_700_000_000_000) },
      ],
    });
  });

  async function ready(): Promise<TtsStore> {
    await TestBed.inject(CredentialStore).load();
    const store = TestBed.inject(TtsStore);
    await store.load();
    return store;
  }

  it('is not configured until both a model and a voice are saved', async () => {
    const store = await ready();

    store.setDraft({ modelId: FAKE_OPENROUTER.ttsModel });
    await store.save();
    expect(store.readiness()).toBe('incomplete');

    store.setDraft({ voiceId: FAKE_OPENROUTER.voice });
    await store.save();
    expect(store.readiness()).toBe('untested');
  });

  it('is ready after a passing test and keeps the verified clip', async () => {
    const store = await ready();
    store.setDraft(CONFIGURED);

    await store.test();

    expect(store.readiness()).toBe('ready');
    expect(store.sample()?.type).toBe('audio/mpeg');
    expect(store.speechInstructionsApplied()).toBe(false);
  });

  it('persists the Gemini default when its optional voice is left blank', async () => {
    const store = await ready();
    store.setDraft({ modelId: 'google/gemini-3.1-flash-tts-preview', voiceId: '' });

    await store.test();

    expect(settings.tts.voiceId).toBe('Kore');
    expect(provider.calls).toBe(1);
    expect(store.readiness()).toBe('ready');
  });

  it('registers a reusable voice preset without making an untested default', async () => {
    const store = await ready();

    await store.registerPreset({
      id: 'gemini-voice',
      name: 'Gemini Kore',
      modelId: 'google/gemini-tts',
      voiceId: 'Kore',
      speechStyle: 'clear',
    });

    expect(store.activePresetId()).toBeNull();
    expect(settings.tts).toMatchObject({
      modelId: '',
      activePresetId: null,
    });
    expect(store.readiness()).toBe('incomplete');
  });

  it('clears voice configuration when the last registered preset is removed', async () => {
    const store = await ready();
    await store.registerPreset({
      id: 'voice',
      name: 'Voice',
      modelId: 'vendor/tts',
      voiceId: 'Kore',
      speechStyle: 'clear',
    });

    await store.removePreset('voice');

    expect(store.presets()).toEqual([]);
    expect(settings.tts).toMatchObject({ activePresetId: null, modelId: '', voiceId: '' });
    expect(store.readiness()).toBe('incomplete');
  });

  it('keeps audio compatibility evidence on the tested preset', async () => {
    const store = await ready();
    await store.registerPreset({ id: 'voice', name: 'Voice', ...CONFIGURED });

    await store.testPreset('voice');

    expect(store.compatiblePresets().map((preset) => preset.id)).toEqual(['voice']);
    expect(store.configForPreset('voice')).toMatchObject(CONFIGURED);
  });

  it('reports that a provider does not accept prompted style instructions', async () => {
    provider.result = ok(ttsTest(false));
    const store = await ready();
    store.setDraft(CONFIGURED);

    await store.test();

    expect(store.readiness()).toBe('ready');
    expect(store.styleControl()).toBe('none');
  });

  it('persists both measured capabilities and stays ready under the stored test', async () => {
    provider.result = ok(ttsTest(true));
    const store = await ready();
    store.setDraft(CONFIGURED);

    await store.test();

    // The findings are stored beside the configuration, and the fingerprint
    // covers the configuration alone — so recording what the test learned
    // cannot make that same test look stale.
    expect(settings.tts).toMatchObject({
      speechInstructions: 'supported',
    });
    expect(store.speechInstructionsApplied()).toBe(true);
    expect(store.styleControl()).toBe('prompted');
    expect(store.readiness()).toBe('ready');
  });

  it('reports no style channel when the provider did not accept instructions', async () => {
    const store = await ready();
    store.setDraft(CONFIGURED);

    await store.test();

    expect(store.styleControl()).toBe('none');
  });

  it('goes stale when the voice or the speaking style changes', async () => {
    const store = await ready();
    store.setDraft(CONFIGURED);
    await store.test();

    store.setDraft({ voiceId: 'kaede' });
    await store.save();
    expect(store.readiness()).toBe('stale');

    store.setDraft({ voiceId: FAKE_OPENROUTER.voice });
    await store.save();
    expect(store.readiness()).toBe('ready');

    store.setDraft({ speechStyle: 'very-clear' });
    await store.save();
    expect(store.readiness()).toBe('stale');
  });

  it('persists the selected speaking style', async () => {
    const store = await ready();

    store.setDraft({ ...CONFIGURED, speechStyle: 'very-clear' });
    await store.save();

    expect(settings.tts.speechStyle).toBe('very-clear');
  });

  it('records a capability failure without a stored result', async () => {
    provider.result = {
      ok: false,
      error: aiError('capability-unsupported', 'tts-test', 'no voice', {
        detail: { capability: 'voice' },
      }),
    };
    const store = await ready();
    store.setDraft(CONFIGURED);

    await store.test();

    expect(store.readiness()).toBe('failed');
    expect(store.testFailure()?.detail?.capability).toBe('voice');
    expect(settings.tts.lastTestFingerprint).toBeNull();
  });

  it('drops a stale clip when the configuration changes', async () => {
    const store = await ready();
    store.setDraft(CONFIGURED);
    await store.test();

    store.setDraft({ voiceId: 'kaede' });
    await store.save();

    expect(store.sample()).toBeNull();
  });

  it('returns to idle after cancellation and records nothing', async () => {
    const store = await ready();
    store.setDraft(CONFIGURED);

    const pending = store.test();
    store.cancelTest();
    await pending;

    expect(store.action()).toBe('idle');
    expect(store.readiness()).toBe('untested');
    expect(provider.calls).toBe(0);
  });

  /**
   * A provider that accepts the request and never answers is the case the Stop
   * control exists for: the request itself times out after a minute, which is
   * far longer than a learner will sit in front of "Playing…".
   */
  it('stops a test that is still waiting, and says the test was stopped', async () => {
    const store = await ready();
    store.setDraft(CONFIGURED);
    await store.save();
    let aborted = false;
    provider.testConfiguration = (_config, signal) =>
      new Promise((resolve) => {
        signal?.addEventListener('abort', () => {
          aborted = true;
          resolve({
            ok: false,
            error: aiError('cancelled', 'tts-test', 'The request was cancelled.'),
          });
        });
      });

    const pending = store.test();
    await Promise.resolve();
    expect(store.action()).toBe('testing');

    store.cancelTest();
    await pending;

    expect(aborted).toBe(true);
    expect(store.action()).toBe('idle');
    expect(store.testCancelled()).toBe(true);
    // Stopping proves nothing either way, so nothing is recorded as a failure.
    expect(store.testFailure()).toBeNull();
    expect(store.readiness()).toBe('untested');
  });

  it('forgets that a test was stopped once another one starts', async () => {
    const store = await ready();
    store.setDraft(CONFIGURED);
    await store.save();
    store.cancelTest();
    expect(store.testCancelled()).toBe(false);

    const pending = store.test();
    store.cancelTest();
    await pending;
    expect(store.testCancelled()).toBe(true);

    await store.test();

    expect(store.testCancelled()).toBe(false);
    expect(store.readiness()).toBe('ready');
  });

  /**
   * Clips are keyed by the configuration that produced them, so a voice change
   * hides them rather than deleting them (ADR 0043) — and setting the voice
   * back has to bring exactly the same key back with it.
   */
  it('restores the previous test, and its fingerprint, when a voice is set back', async () => {
    const store = await ready();
    store.setDraft(CONFIGURED);
    await store.test();
    const original = settings.tts.lastTestFingerprint;

    store.setDraft({ voiceId: 'kaede' });
    await store.save();
    expect(store.readiness()).toBe('stale');
    // Nothing about the change deletes the evidence of the earlier test.
    expect(settings.tts.lastTestFingerprint).toBe(original);

    store.setDraft({ voiceId: FAKE_OPENROUTER.voice });
    await store.save();

    expect(store.readiness()).toBe('ready');
    expect(settings.tts.lastTestFingerprint).toBe(original);
  });

  it('surfaces a storage failure when the result cannot be stored', async () => {
    const store = await ready();
    store.setDraft(CONFIGURED);
    await store.save();
    settings.failWrites = storageError('quota', 'no room');

    await store.test();

    expect(store.storageFailure()?.code).toBe('quota');
  });
});

describe('text and TTS readiness independence', () => {
  let settings: StubAiSettingsRepository;
  let tts: StubTtsProvider;

  beforeEach(() => {
    settings = new StubAiSettingsRepository();
    tts = new StubTtsProvider(ok(ttsTest()));

    TestBed.configureTestingModule({
      providers: [
        TtsStore,
        TextModelStore,
        CredentialStore,
        { provide: SETTINGS_REPOSITORY, useValue: settings },
        { provide: CREDENTIAL_REPOSITORY, useValue: new FakeCredentialRepository() },
        { provide: TEXT_TO_SPEECH_PROVIDER, useValue: tts },
        {
          provide: TEXT_GENERATION_PROVIDER,
          useValue: new StubTextProvider(ok(modelTest())),
        },
        { provide: HASHER, useValue: HASH },
        { provide: CLOCK, useValue: fixedClock(1_700_000_000_000) },
      ],
    });
  });

  it('leaves text readiness untouched when the TTS test fails', async () => {
    await TestBed.inject(CredentialStore).load();
    const text = TestBed.inject(TextModelStore);
    const speech = TestBed.inject(TtsStore);
    await text.load();
    await speech.load();
    text.setDraftModelId(FAKE_OPENROUTER.textModel);
    await text.test();

    tts.result = {
      ok: false,
      error: aiError('capability-unsupported', 'tts-test', 'no audio'),
    };
    speech.setDraft(CONFIGURED);
    await speech.test();

    expect(speech.readiness()).toBe('failed');
    expect(text.readiness()).toBe('ready');
    expect(text.testFailure()).toBeNull();
  });

  it('leaves TTS readiness untouched when the text model changes', async () => {
    await TestBed.inject(CredentialStore).load();
    const text = TestBed.inject(TextModelStore);
    const speech = TestBed.inject(TtsStore);
    await text.load();
    await speech.load();
    speech.setDraft(CONFIGURED);
    await speech.test();

    text.setDraftModelId('vendor/changed');
    await text.save();

    expect(speech.readiness()).toBe('ready');
  });
});

describe('TtsStore edge paths', () => {
  let settings: StubAiSettingsRepository;
  let provider: StubTtsProvider;

  beforeEach(() => {
    settings = new StubAiSettingsRepository();
    provider = new StubTtsProvider(ok(ttsTest()));
    TestBed.configureTestingModule({
      providers: [
        TtsStore,
        CredentialStore,
        { provide: SETTINGS_REPOSITORY, useValue: settings },
        { provide: CREDENTIAL_REPOSITORY, useValue: new FakeCredentialRepository() },
        { provide: TEXT_TO_SPEECH_PROVIDER, useValue: provider },
        { provide: HASHER, useValue: HASH },
        { provide: CLOCK, useValue: fixedClock(1_700_000_000_000) },
      ],
    });
  });

  it('surfaces a failed read without claiming to be configured', async () => {
    settings.failReads = storageError('corrupt-record', 'bad row');
    const store = TestBed.inject(TtsStore);

    await store.load();

    expect(store.storageFailure()?.code).toBe('corrupt-record');
    expect(store.readiness()).toBe('no-credential');
  });

  it('makes no request when the draft cannot be stored', async () => {
    await TestBed.inject(CredentialStore).load();
    const store = TestBed.inject(TtsStore);
    await store.load();
    settings.failWrites = storageError('quota', 'no room');

    store.setDraft(CONFIGURED);
    await store.test();

    expect(provider.calls).toBe(0);
    expect(store.action()).toBe('idle');
    expect(store.storageFailure()?.code).toBe('quota');
  });

  it('makes no request while the voice is still missing', async () => {
    await TestBed.inject(CredentialStore).load();
    const store = TestBed.inject(TtsStore);
    await store.load();

    store.setDraft({ modelId: FAKE_OPENROUTER.ttsModel });
    await store.test();

    expect(provider.calls).toBe(0);
    expect(store.action()).toBe('idle');
  });

  it('supersedes an attempt that has not spent a request yet', async () => {
    await TestBed.inject(CredentialStore).load();
    const store = TestBed.inject(TtsStore);
    await store.load();
    store.setDraft(CONFIGURED);
    await store.save();

    const first = store.test();
    const second = store.test();
    await Promise.all([first, second]);

    expect(provider.calls).toBe(1);
    expect(store.readiness()).toBe('ready');
  });

  it('starts with the default speaking style', async () => {
    await TestBed.inject(CredentialStore).load();
    const store = TestBed.inject(TtsStore);
    await store.load();

    expect(store.draft().speechStyle).toBe('clear');
  });
});
