import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { aiError } from '../../domain/ai/ai-error';
import type { ImportedReadingDraft } from '../../domain/reading/reading-repository';
import type { Sentence } from '../../domain/reading/text-hierarchy';
import type { TtsSettings } from '../../domain/settings/settings';
import { fixedClock } from '../../domain/shared/clock';
import type { Hasher } from '../../domain/shared/hashing';
import type { SentenceId } from '../../domain/shared/ids';
import { err, ok } from '../../domain/shared/result';
import type { MonosaiDatabase } from '../../infrastructure/persistence/monosai-db';
import { DexieEnrichmentRepository } from '../../infrastructure/persistence/repositories/dexie-enrichment.repository';
import { DexieReadingRepository } from '../../infrastructure/persistence/repositories/dexie-reading.repository';
import { StubTtsProvider, ttsTest } from '../../../testing/ai-fakes';
import { importedReadingFixture } from '../../../testing/persistence-fixtures';
import { createTestDatabase, destroyTestDatabase } from '../../../testing/test-database';
import { TEXT_TO_SPEECH_PROVIDER } from '../shared/ai-tokens';
import {
  CLOCK,
  ENRICHMENT_REPOSITORY,
  HASHER,
  ID_GENERATOR,
  READING_REPOSITORY,
} from '../shared/repository-tokens';
import { TtsStore } from '../settings/tts.store';
import { AudioConfigurationService } from './audio-configuration.service';
import { AudioSynthesisService } from './audio-synthesis.service';
import { EnrichmentKeysService } from './enrichment-keys.service';

const NOW = 1_700_600_000_000;
const TEST_HASHER: Hasher = { algorithm: 'test', hashText: (text) => `h(${text})` };

interface SynthesisBed {
  readonly db: MonosaiDatabase;
  readonly service: AudioSynthesisService;
  readonly config: AudioConfigurationService;
  readonly keys: EnrichmentKeysService;
  readonly provider: StubTtsProvider;
  readonly enrichment: DexieEnrichmentRepository;
  readonly draft: ImportedReadingDraft;
  readonly settings: WritableSignal<TtsSettings>;
  readonly readiness: WritableSignal<'ready' | 'not-configured' | 'stale-test'>;
}

async function configure(): Promise<SynthesisBed> {
  TestBed.resetTestingModule();
  const db = await createTestDatabase();
  const clock = fixedClock(NOW);
  const readings = new DexieReadingRepository(db, clock);
  const enrichment = new DexieEnrichmentRepository(db);
  const provider = new StubTtsProvider(ok(ttsTest()));
  const draft = importedReadingFixture();
  await readings.saveImportedReading(draft);

  const settings = signal<TtsSettings>({
    modelId: 'vendor/tts',
    voiceId: 'voice-a',
    speed: 1,
    speedSupported: true,
    lastTestFingerprint: 'fingerprint',
    lastTestedAt: NOW,
    activePresetId: null,
    presets: [],
  });
  const readiness = signal<'ready' | 'not-configured' | 'stale-test'>('ready');

  let counter = 0;
  TestBed.configureTestingModule({
    providers: [
      AudioSynthesisService,
      AudioConfigurationService,
      EnrichmentKeysService,
      { provide: TEXT_TO_SPEECH_PROVIDER, useValue: provider },
      { provide: READING_REPOSITORY, useValue: readings },
      { provide: ENRICHMENT_REPOSITORY, useValue: enrichment },
      { provide: CLOCK, useValue: clock },
      { provide: HASHER, useValue: TEST_HASHER },
      {
        provide: ID_GENERATOR,
        useValue: {
          nextId: () => {
            counter += 1;
            return `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
          },
        },
      },
      { provide: TtsStore, useValue: { settings, readiness } },
    ],
  });

  return {
    db,
    service: TestBed.inject(AudioSynthesisService),
    config: TestBed.inject(AudioConfigurationService),
    keys: TestBed.inject(EnrichmentKeysService),
    provider,
    enrichment,
    draft,
    settings,
    readiness,
  };
}

describe('AudioSynthesisService', () => {
  let bed: SynthesisBed;

  beforeEach(async () => {
    bed = await configure();
  });

  afterEach(async () => {
    await destroyTestDatabase(bed.db);
  });

  function firstSentence(): Sentence {
    return [...bed.draft.sentences].sort(
      (left, right) => left.positionInReading - right.positionInReading,
    )[0];
  }

  function resolved() {
    const config = bed.config.resolve('tts-synthesis');
    if (!config.ok) {
      throw new Error('the test configuration should resolve');
    }
    return config.value;
  }

  function cacheKeys(): ReadonlyMap<SentenceId, string> {
    const config = resolved();
    return bed.keys.audioKeys(
      bed.draft.sentences,
      config.modelId,
      config.voiceId,
      config.optionsFingerprint,
    );
  }

  function keyFor(sentence: Sentence): string {
    const key = cacheKeys().get(sentence.id);
    if (key === undefined) {
      throw new Error('every fixture sentence should have a key');
    }
    return key;
  }

  /**
   * ADR 0021's split, applied to audio: `run` produces a record without writing
   * anything, so a cancelled or refused attempt cannot leave a row behind.
   */
  it('produces a clip without writing it', async () => {
    const sentence = firstSentence();

    const produced = await bed.service.run(
      sentence,
      bed.draft.reading.id,
      keyFor(sentence),
      resolved(),
      new AbortController().signal,
    );

    expect(produced.ok).toBe(true);
    if (!produced.ok) {
      return;
    }
    expect(produced.value.sentenceId).toBe(sentence.id);
    expect(produced.value.cacheKey).toBe(keyFor(sentence));
    expect(produced.value.mimeType).toBe('audio/mpeg');
    expect(produced.value.blob.size).toBe(produced.value.byteLength);
    expect(await bed.db.audioAssets.count()).toBe(0);
  });

  it('sends the resolved model, voice, speed, and format', async () => {
    bed.settings.set({ ...bed.settings(), speed: 0.75 });
    const sentence = firstSentence();

    await bed.service.run(
      sentence,
      bed.draft.reading.id,
      keyFor(sentence),
      resolved(),
      new AbortController().signal,
    );

    expect(bed.provider.synthesized).toEqual([
      {
        text: sentence.japaneseText,
        modelId: 'vendor/tts',
        voiceId: 'voice-a',
        speed: 0.75,
        responseFormat: 'mp3',
        speedSupported: true,
        speechInstructions: 'unsupported',
      },
    ]);
  });

  it('writes the clip and refreshes the reading summary together', async () => {
    const sentence = firstSentence();
    const produced = await bed.service.run(
      sentence,
      bed.draft.reading.id,
      keyFor(sentence),
      resolved(),
      new AbortController().signal,
    );
    if (!produced.ok) {
      throw new Error('synthesis should have succeeded');
    }

    const stored = await bed.service.store(produced.value, cacheKeys());

    expect(stored.ok).toBe(true);
    expect(await bed.db.audioAssets.count()).toBe(1);
    const row = await bed.db.readings.get(bed.draft.reading.id);
    expect(row?.audioSummary).toEqual({
      total: bed.draft.sentences.length,
      completed: 1,
      failed: 0,
    });
  });

  /** A clip's key already names everything that identifies it. */
  it('serves a stored clip without a request', async () => {
    const sentence = firstSentence();
    const first = await bed.service.run(
      sentence,
      bed.draft.reading.id,
      keyFor(sentence),
      resolved(),
      new AbortController().signal,
    );
    if (!first.ok) {
      throw new Error('synthesis should have succeeded');
    }
    await bed.service.store(first.value, cacheKeys());
    const requestsSoFar = bed.provider.synthesized.length;

    const again = await bed.service.run(
      sentence,
      bed.draft.reading.id,
      keyFor(sentence),
      resolved(),
      new AbortController().signal,
    );

    expect(bed.provider.synthesized).toHaveLength(requestsSoFar);
    expect(again.ok && again.value.cacheKey).toBe(keyFor(sentence));
  });

  it('reports a provider refusal without writing anything', async () => {
    bed.provider.synthesizeWith = () =>
      err(aiError('rate-limited', 'tts-synthesis', 'Too many requests.'));
    const sentence = firstSentence();

    const produced = await bed.service.run(
      sentence,
      bed.draft.reading.id,
      keyFor(sentence),
      resolved(),
      new AbortController().signal,
    );

    expect(produced.ok).toBe(false);
    if (produced.ok) {
      return;
    }
    expect(produced.error.code).toBe('rate-limited');
    expect(await bed.db.audioAssets.count()).toBe(0);
  });

  it('lists every sentence as missing before anything is stored', async () => {
    const missing = await bed.service.missingSentenceIds(bed.draft.reading.id, cacheKeys());

    expect(missing.ok && missing.value).toHaveLength(bed.draft.sentences.length);
  });

  /**
   * Changing the voice makes every sentence missing again without deleting a
   * clip the learner already paid for.
   */
  it('lists a stored sentence as missing once the voice changes', async () => {
    const sentence = firstSentence();
    const produced = await bed.service.run(
      sentence,
      bed.draft.reading.id,
      keyFor(sentence),
      resolved(),
      new AbortController().signal,
    );
    if (!produced.ok) {
      throw new Error('synthesis should have succeeded');
    }
    await bed.service.store(produced.value, cacheKeys());

    const beforeChange = await bed.service.missingSentenceIds(bed.draft.reading.id, cacheKeys());
    expect(beforeChange.ok && beforeChange.value).toHaveLength(bed.draft.sentences.length - 1);

    bed.settings.set({ ...bed.settings(), voiceId: 'voice-b' });
    const afterChange = await bed.service.missingSentenceIds(bed.draft.reading.id, cacheKeys());

    expect(afterChange.ok && afterChange.value).toHaveLength(bed.draft.sentences.length);
    expect(await bed.db.audioAssets.count()).toBe(1);
  });
});

describe('AudioConfigurationService', () => {
  let bed: SynthesisBed;

  beforeEach(async () => {
    bed = await configure();
  });

  afterEach(async () => {
    await destroyTestDatabase(bed.db);
  });

  it('resolves the saved model, voice, and speed once the test has passed', () => {
    const config = bed.config.resolve('tts-synthesis');

    expect(config.ok).toBe(true);
    if (!config.ok) {
      return;
    }
    expect(config.value.modelId).toBe('vendor/tts');
    expect(config.value.voiceId).toBe('voice-a');
    expect(config.value.speed).toBe(1);
    expect(config.value.configFingerprint).not.toBe(config.value.optionsFingerprint);
  });

  /**
   * `ai-pipelines.md` section 11 step 1: an untested or stale configuration
   * would spend money to discover what the test exists to find out for the
   * price of one sentence.
   */
  it('refuses a configuration whose test no longer stands', () => {
    bed.readiness.set('stale-test');

    const config = bed.config.resolve('tts-synthesis');

    expect(config.ok).toBe(false);
    if (config.ok) {
      return;
    }
    expect(config.error.code).toBe('capability-unsupported');
    expect(config.error.detail?.capability).toBe('text-to-speech');
    expect(config.error.message).toContain('has not passed its test');
  });

  it('refuses, and says so differently, when nothing is configured at all', () => {
    bed.readiness.set('not-configured');

    const config = bed.config.resolve('tts-synthesis');

    expect(config.ok).toBe(false);
    if (config.ok) {
      return;
    }
    expect(config.error.message).toContain('No text-to-speech model and voice are set up.');
  });

  it('reports the refusal against the task that asked', () => {
    bed.readiness.set('not-configured');

    expect(bed.config.resolve('tts-test').ok).toBe(false);
    const config = bed.config.resolve('tts-test');
    expect(!config.ok && config.error.task).toBe('tts-test');
  });

  it('changes the configuration fingerprint when the speed changes', () => {
    const before = bed.config.resolve('tts-synthesis');
    bed.settings.set({ ...bed.settings(), speed: 1.5 });
    const after = bed.config.resolve('tts-synthesis');

    expect(before.ok && after.ok).toBe(true);
    if (!before.ok || !after.ok) {
      return;
    }
    expect(after.value.configFingerprint).not.toBe(before.value.configFingerprint);
    expect(after.value.optionsFingerprint).not.toBe(before.value.optionsFingerprint);
  });
});
