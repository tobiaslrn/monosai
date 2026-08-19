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
import { MAX_TTS_SPEED, TtsStore } from './tts.store';

const HASH: Hasher = { algorithm: 'test', hashText: (text) => `h(${text})` };
const CONFIGURED = { modelId: FAKE_OPENROUTER.ttsModel, voiceId: FAKE_OPENROUTER.voice };

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
    expect(store.readiness()).toBe('not-configured');

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
    expect(store.speedApplied()).toBe(true);
  });

  it('reports a speed the provider ignored rather than implying it applied', async () => {
    provider.result = ok(ttsTest(false));
    const store = await ready();
    store.setDraft(CONFIGURED);

    await store.test();

    expect(store.readiness()).toBe('ready');
    expect(store.speedApplied()).toBe(false);
  });

  it('goes stale when the voice or the speed changes', async () => {
    const store = await ready();
    store.setDraft(CONFIGURED);
    await store.test();

    store.setDraft({ voiceId: 'kaede' });
    await store.save();
    expect(store.readiness()).toBe('stale');

    store.setDraft({ voiceId: FAKE_OPENROUTER.voice });
    await store.save();
    expect(store.readiness()).toBe('ready');

    store.setDraft({ speed: 1.5 });
    await store.save();
    expect(store.readiness()).toBe('stale');
  });

  it('clamps a speed outside what providers accept', async () => {
    const store = await ready();

    store.setDraft({ ...CONFIGURED, speed: 9 });
    await store.save();

    expect(settings.tts.speed).toBe(MAX_TTS_SPEED);
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
