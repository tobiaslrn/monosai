import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fixedClock } from '../../../domain/shared/clock';
import { assetId } from '../../../domain/shared/ids';
import type { AudioAsset, TranslationRecord } from '../../../domain/enrichment/records';
import { createTestDatabase, destroyTestDatabase } from '../../../../testing/test-database';
import { importedReadingFixture, uuid } from '../../../../testing/persistence-fixtures';
import type { MonosaiDatabase } from '../monosai-db';
import { DexieEnrichmentRepository } from './dexie-enrichment.repository';
import { DexieReadingRepository } from './dexie-reading.repository';

const MODEL = 'vendor/text-model';

describe('DexieEnrichmentRepository', () => {
  let db: MonosaiDatabase;
  let repository: DexieEnrichmentRepository;
  let readings: DexieReadingRepository;
  let draft: ReturnType<typeof importedReadingFixture>;

  beforeEach(async () => {
    db = await createTestDatabase();
    repository = new DexieEnrichmentRepository(db);
    readings = new DexieReadingRepository(db, fixedClock(1_700_500_000_000));
    draft = importedReadingFixture();
    await readings.saveImportedReading(draft);
  });

  afterEach(async () => {
    await destroyTestDatabase(db);
  });

  function translation(index: number, cacheKey = `translation-${index}`): TranslationRecord {
    return {
      id: uuid(7000 + index),
      sentenceId: draft.sentences[index].id,
      readingId: draft.reading.id,
      sourceContentHash: draft.sentences[index].contentHash,
      textEn: `Sentence ${index} in English.`,
      modelId: MODEL,
      promptVersion: 'translate-v1',
      cacheKey,
      createdAt: 1_700_500_000_000 + index,
    };
  }

  function audio(index: number, cacheKey = `audio-${index}`): AudioAsset {
    return {
      id: assetId(uuid(7500 + index)),
      sentenceId: draft.sentences[index].id,
      readingId: draft.reading.id,
      sourceContentHash: draft.sentences[index].contentHash,
      modelId: 'vendor/tts-model',
      voiceId: 'voice-a',
      optionsFingerprint: 'tts-fingerprint',
      mimeType: 'audio/mpeg',
      byteLength: 4,
      blob: new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/mpeg' }),
      cacheKey,
      createdAt: 1_700_500_000_000 + index,
    };
  }

  it('stores and reads a translation by cache key', async () => {
    await repository.storeTranslation(translation(0));

    const loaded = await repository.getTranslationByCacheKey('translation-0');

    expect(loaded.ok && loaded.value?.textEn).toBe('Sentence 0 in English.');
    expect((await repository.getTranslationByCacheKey('missing')).ok).toBe(true);
    expect(await db.translations.count()).toBe(1);
  });

  it('writes idempotently for the same cache key', async () => {
    await repository.storeTranslation(translation(0));
    await repository.storeTranslation(translation(0));

    expect(await db.translations.count()).toBe(1);
  });

  it('updates the reading translation summary in the same transaction', async () => {
    await repository.storeTranslation(translation(0));
    await repository.storeTranslation(translation(1, 'translation-1'));

    const reading = await readings.getReading(draft.reading.id);

    expect(reading.ok).toBe(true);
    if (!reading.ok || !reading.value) {
      return;
    }
    expect(reading.value.translationSummary).toEqual({
      total: draft.sentences.length,
      completed: 2,
      failed: 0,
    });
  });

  it('lists sentences that still need a translation for the current configuration', async () => {
    await repository.storeTranslation(translation(0));

    const cacheKeys = new Map(
      draft.sentences.map((sentence, index) => [sentence.id, `translation-${index}`]),
    );
    const missing = await repository.listSentenceIdsMissingTranslation(draft.reading.id, cacheKeys);

    expect(missing.ok).toBe(true);
    if (!missing.ok) {
      return;
    }
    expect(missing.value).toEqual([draft.sentences[1].id, draft.sentences[2].id]);
  });

  it('stores audio and returns metadata without the blob', async () => {
    const stored = await repository.storeAudio(audio(0));

    expect(stored.ok).toBe(true);
    if (!stored.ok) {
      return;
    }
    expect('blob' in stored.value).toBe(false);
    expect(stored.value.byteLength).toBe(4);
  });

  it('lists audio summaries without loading blobs', async () => {
    await repository.storeAudio(audio(0));
    await repository.storeAudio(audio(1, 'audio-1'));

    const summaries = await repository.listAudioSummaries(draft.reading.id);

    expect(summaries.ok).toBe(true);
    if (!summaries.ok) {
      return;
    }
    expect(summaries.value).toHaveLength(2);
    for (const summary of summaries.value) {
      expect('blob' in summary).toBe(false);
    }
  });

  it('returns the blob only when the clip is requested by cache key', async () => {
    await repository.storeAudio(audio(0));

    const loaded = await repository.getAudioByCacheKey('audio-0');

    expect(loaded.ok).toBe(true);
    if (!loaded.ok || !loaded.value) {
      return;
    }
    expect(loaded.value.blob.size).toBe(4);
  });

  it('summarizes completion against the current configuration fingerprint', async () => {
    await repository.storeAudio(audio(0));

    const current = await repository.summarizeAudio(draft.reading.id, 'tts-fingerprint');
    const other = await repository.summarizeAudio(draft.reading.id, 'different-fingerprint');

    expect(current.ok && current.value.completed).toBe(1);
    expect(other.ok && other.value.completed).toBe(0);
    expect(current.ok && current.value.total).toBe(draft.sentences.length);
  });

  it('stores grammar analyses with their profile hash', async () => {
    await repository.storeGrammarAnalysis({
      id: uuid(7900),
      cacheKey: 'grammar-0',
      sentenceId: draft.sentences[0].id,
      readingId: draft.reading.id,
      sourceContentHash: draft.sentences[0].contentHash,
      profileHash: 'profile-hash-1',
      modelId: MODEL,
      promptVersion: 'grammar-v1',
      findings: [
        {
          label: 'が (subject marker)',
          explanationEn: 'Marks the subject of the sentence.',
          confidence: 'high',
          inProfile: true,
        },
      ],
      createdAt: 1_700_500_000_000,
    });

    const loaded = await repository.getGrammarAnalysisByCacheKey('grammar-0');

    expect(loaded.ok && loaded.value?.profileHash).toBe('profile-hash-1');
    expect(loaded.ok && loaded.value?.findings[0].confidence).toBe('high');
  });

  it('deletes a single audio clip without touching translations', async () => {
    const asset = audio(0);
    await repository.storeAudio(asset);
    await repository.storeTranslation(translation(0));

    await repository.deleteAudio(asset.id);

    expect(await db.audioAssets.count()).toBe(0);
    expect(await db.translations.count()).toBe(1);
  });
});
