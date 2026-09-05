import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixedClock } from '../../../domain/shared/clock';
import { assetId } from '../../../domain/shared/ids';
import type {
  AudioAsset,
  GrammarAnalysisRecord,
  TranslationRecord,
} from '../../../domain/enrichment/records';
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

  function grammarAnalysis(
    index: number,
    cacheKey = `grammar-${index}`,
    findings: GrammarAnalysisRecord['findings'] = [],
  ): GrammarAnalysisRecord {
    return {
      id: uuid(7900 + index),
      cacheKey,
      sentenceId: draft.sentences[index].id,
      readingId: draft.reading.id,
      sourceContentHash: draft.sentences[index].contentHash,
      profileHash: 'profile-hash-1',
      modelId: MODEL,
      promptVersion: 'grammar-v1',
      findings,
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

  /** Maps every fixture sentence to `translation-{index}`, the current key. */
  function currentTranslationKeys(): Map<(typeof draft.sentences)[number]['id'], string> {
    return new Map(draft.sentences.map((sentence, index) => [sentence.id, `translation-${index}`]));
  }

  function currentGrammarKeys(): Map<(typeof draft.sentences)[number]['id'], string> {
    return new Map(draft.sentences.map((sentence, index) => [sentence.id, `grammar-${index}`]));
  }

  function currentAudioKeys(): Map<(typeof draft.sentences)[number]['id'], string> {
    return new Map(draft.sentences.map((sentence, index) => [sentence.id, `audio-${index}`]));
  }

  it('stores and reads a translation by cache key', async () => {
    await repository.storeTranslation(translation(0), currentTranslationKeys());

    const loaded = await repository.getTranslationByCacheKey('translation-0');

    expect(loaded.ok && loaded.value?.textEn).toBe('Sentence 0 in English.');
    expect((await repository.getTranslationByCacheKey('missing')).ok).toBe(true);
    expect(await db.translations.count()).toBe(1);
  });

  it('writes idempotently for the same cache key', async () => {
    await repository.storeTranslation(translation(0), currentTranslationKeys());
    await repository.storeTranslation(translation(0), currentTranslationKeys());

    expect(await db.translations.count()).toBe(1);
  });

  it('updates the reading translation summary in the same transaction', async () => {
    const cacheKeys = currentTranslationKeys();
    await repository.storeTranslation(translation(0), cacheKeys);
    await repository.storeTranslation(translation(1, 'translation-1'), cacheKeys);

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

  it('counts every sentence covered by a shared translation key', async () => {
    const cacheKeys = currentTranslationKeys();
    cacheKeys.set(draft.sentences[1].id, 'translation-0');

    await repository.storeTranslation(translation(0), cacheKeys);

    const reading = await readings.getReading(draft.reading.id);

    expect(reading.ok && reading.value?.translationSummary).toEqual({
      total: draft.sentences.length,
      completed: 2,
      failed: 0,
    });
  });

  it('does not let a historic-model translation row inflate completion', async () => {
    // A row cached under an old model/prompt stays in the table, but it must
    // never count toward completion once the caller's current key differs.
    await repository.storeTranslation(translation(0, 'stale-key'), currentTranslationKeys());

    const summary = await repository.summarizeTranslations(
      draft.reading.id,
      currentTranslationKeys(),
    );

    expect(summary.ok).toBe(true);
    if (!summary.ok) {
      return;
    }
    expect(summary.value).toEqual({ total: draft.sentences.length, completed: 0, failed: 0 });
  });

  it('lists sentences that still need a translation for the current configuration', async () => {
    await repository.storeTranslation(translation(0), currentTranslationKeys());

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

  describe('sentences that own a stored aid under any configuration', () => {
    it('reports a row stored under a configuration that is no longer current', async () => {
      await repository.storeTranslation(translation(0, 'historic-key'), currentTranslationKeys());

      const stored = await repository.listSentenceIdsWithStoredTranslation(
        draft.sentences.map((sentence) => sentence.id),
      );

      expect(stored.ok).toBe(true);
      if (!stored.ok) {
        return;
      }
      expect(stored.value).toEqual([draft.sentences[0].id]);
    });

    it('answers only for the sentences it was asked about', async () => {
      await repository.storeTranslation(translation(0), currentTranslationKeys());
      await repository.storeTranslation(translation(1, 'translation-1'), currentTranslationKeys());

      const stored = await repository.listSentenceIdsWithStoredTranslation([draft.sentences[1].id]);

      expect(stored.ok).toBe(true);
      if (!stored.ok) {
        return;
      }
      expect(stored.value).toEqual([draft.sentences[1].id]);
    });

    it('reports stored grammar analyses regardless of their profile', async () => {
      await repository.storeGrammarAnalysis(
        { ...grammarAnalysis(2), profileHash: 'a-retired-profile' },
        currentGrammarKeys(),
      );

      const stored = await repository.listSentenceIdsWithStoredGrammarAnalysis(
        draft.sentences.map((sentence) => sentence.id),
      );

      expect(stored.ok).toBe(true);
      if (!stored.ok) {
        return;
      }
      expect(stored.value).toEqual([draft.sentences[2].id]);
    });

    it('reports stored audio without reading a single clip', async () => {
      await repository.storeAudio(audio(1), currentAudioKeys());
      const spy = vi.spyOn(db.audioAssets, 'toArray');

      const stored = await repository.listSentenceIdsWithStoredAudio(
        draft.sentences.map((sentence) => sentence.id),
      );

      expect(stored.ok).toBe(true);
      if (!stored.ok) {
        return;
      }
      expect(stored.value).toEqual([draft.sentences[1].id]);
      expect(spy).not.toHaveBeenCalled();
    });

    it('asks nothing of the database for an empty reading', async () => {
      const spy = vi.spyOn(db.translations, 'where');

      const stored = await repository.listSentenceIdsWithStoredTranslation([]);

      expect(stored.ok).toBe(true);
      if (!stored.ok) {
        return;
      }
      expect(stored.value).toEqual([]);
      expect(spy).not.toHaveBeenCalled();
    });
  });

  it('lists translations only for the requested sentences, not the whole reading', async () => {
    const cacheKeys = currentTranslationKeys();
    await repository.storeTranslation(translation(0), cacheKeys);
    await repository.storeTranslation(translation(1, 'translation-1'), cacheKeys);
    await repository.storeTranslation(translation(2, 'translation-2'), cacheKeys);

    const bounded = await repository.listTranslationsForSentences([
      draft.sentences[0].id,
      draft.sentences[2].id,
    ]);

    expect(bounded.ok).toBe(true);
    if (!bounded.ok) {
      return;
    }
    expect(bounded.value.map((record) => record.sentenceId).sort()).toEqual(
      [draft.sentences[0].id, draft.sentences[2].id].sort(),
    );
  });

  it('lists current translations by cache key', async () => {
    await repository.storeTranslation(translation(0), currentTranslationKeys());

    const bounded = await repository.listTranslationsForCacheKeys(['translation-0']);

    expect(bounded.ok && bounded.value.map((record) => record.cacheKey)).toEqual(['translation-0']);
  });

  it('rolls back a failed store, leaving the prior row and summary intact', async () => {
    const cacheKeys = currentTranslationKeys();
    await repository.storeTranslation(translation(0), cacheKeys);

    const failure = new Error('disk unavailable');
    failure.name = 'UnknownError';
    vi.spyOn(db.readings, 'update').mockRejectedValueOnce(failure);

    const result = await repository.storeTranslation(translation(1, 'translation-1'), cacheKeys);

    expect(result.ok).toBe(false);
    expect(await db.translations.count()).toBe(1);
    const reading = await readings.getReading(draft.reading.id);
    expect(reading.ok && reading.value?.translationSummary).toEqual({
      total: draft.sentences.length,
      completed: 1,
      failed: 0,
    });
  });

  it('stores audio and returns metadata without the blob', async () => {
    const stored = await repository.storeAudio(audio(0), currentAudioKeys());

    expect(stored.ok).toBe(true);
    if (!stored.ok) {
      return;
    }
    expect('blob' in stored.value).toBe(false);
    expect(stored.value.byteLength).toBe(4);
  });

  it('lists audio summaries without loading blobs', async () => {
    await repository.storeAudio(audio(0), currentAudioKeys());
    await repository.storeAudio(audio(1, 'audio-1'), currentAudioKeys());

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
    await repository.storeAudio(audio(0), currentAudioKeys());

    const loaded = await repository.getAudioByCacheKey('audio-0');

    expect(loaded.ok).toBe(true);
    if (!loaded.ok || !loaded.value) {
      return;
    }
    expect(loaded.value.blob.size).toBe(4);
  });

  it('summarizes audio completion against the current per-sentence cache keys', async () => {
    await repository.storeAudio(audio(0), currentAudioKeys());

    const audioKeys = new Map(
      draft.sentences.map((sentence, index) => [sentence.id, `audio-${index}`]),
    );
    const current = await repository.summarizeAudio(draft.reading.id, audioKeys);

    const staleKeys = new Map(
      draft.sentences.map((sentence, index) => [sentence.id, `other-audio-${index}`]),
    );
    const other = await repository.summarizeAudio(draft.reading.id, staleKeys);

    expect(current.ok && current.value.completed).toBe(1);
    expect(other.ok && other.value.completed).toBe(0);
    expect(current.ok && current.value.total).toBe(draft.sentences.length);
  });

  it('stores grammar analyses with their profile hash', async () => {
    await repository.storeGrammarAnalysis(
      grammarAnalysis(0, 'grammar-0', [
        {
          label: 'が (subject marker)',
          explanationEn: 'Marks the subject of the sentence.',
          confidence: 'high',
          inProfile: true,
        },
      ]),
      currentGrammarKeys(),
    );

    const loaded = await repository.getGrammarAnalysisByCacheKey('grammar-0');

    expect(loaded.ok && loaded.value?.profileHash).toBe('profile-hash-1');
    expect(loaded.ok && loaded.value?.findings[0].confidence).toBe('high');
  });

  it('lists grammar analyses only for the requested sentences, not the whole reading', async () => {
    const cacheKeys = currentGrammarKeys();
    await repository.storeGrammarAnalysis(grammarAnalysis(0), cacheKeys);
    await repository.storeGrammarAnalysis(grammarAnalysis(1), cacheKeys);
    await repository.storeGrammarAnalysis(grammarAnalysis(2), cacheKeys);

    const bounded = await repository.listGrammarAnalysesForSentences([draft.sentences[1].id]);

    expect(bounded.ok).toBe(true);
    if (!bounded.ok) {
      return;
    }
    expect(bounded.value.map((record) => record.sentenceId)).toEqual([draft.sentences[1].id]);
  });

  describe('grammar summary', () => {
    it('walks not-requested -> partial -> complete as current-key rows appear', async () => {
      const notRequested = await repository.summarizeGrammar(draft.reading.id, new Map());
      expect(notRequested.ok && notRequested.value).toEqual({ state: 'not-requested' });

      const cacheKeys = currentGrammarKeys();
      await repository.storeGrammarAnalysis(
        grammarAnalysis(0, 'grammar-0', [
          { label: 'a', explanationEn: 'a', confidence: 'high', inProfile: false },
        ]),
        cacheKeys,
      );

      const partial = await repository.summarizeGrammar(draft.reading.id, cacheKeys);
      expect(partial.ok && partial.value).toEqual({
        state: 'partial',
        analyzedSentenceCount: 1,
        concernCount: 1,
      });

      await repository.storeGrammarAnalysis(
        grammarAnalysis(1, 'grammar-1', [
          { label: 'b', explanationEn: 'b', confidence: 'high', inProfile: true },
        ]),
        cacheKeys,
      );
      await repository.storeGrammarAnalysis(
        grammarAnalysis(2, 'grammar-2', [
          { label: 'c', explanationEn: 'c', confidence: 'high', inProfile: false },
        ]),
        cacheKeys,
      );

      const complete = await repository.summarizeGrammar(draft.reading.id, cacheKeys);
      expect(complete.ok && complete.value).toEqual({ state: 'complete', concernCount: 2 });
    });

    it('updates the reading grammar summary inside the same transaction as the write', async () => {
      const cacheKeys = currentGrammarKeys();
      await repository.storeGrammarAnalysis(
        grammarAnalysis(0, 'grammar-0', [
          { label: 'a', explanationEn: 'a', confidence: 'high', inProfile: false },
        ]),
        cacheKeys,
      );

      const reading = await readings.getReading(draft.reading.id);
      expect(reading.ok && reading.value?.grammarSummary).toEqual({
        state: 'partial',
        analyzedSentenceCount: 1,
        concernCount: 1,
      });
    });
  });

  describe('audio completeness', () => {
    /**
     * The regression test for the defect Milestone 9 fixed.
     *
     * `refreshAudioSummary` counted every audio row for the reading without
     * comparing each row's `cacheKey` against the current one, so a clip made
     * by a voice the learner no longer uses counted toward "this reading has
     * audio". The complete-set gate sits directly on this count, and
     * `domain-and-data-model.md` section 6 forbids historical output from an old
     * model counting toward current completeness.
     */
    it('refuses to count a row whose cache key is not the current one', async () => {
      // Stored under the voice of the day, then judged under a new one.
      await repository.storeAudio(audio(0), currentAudioKeys());

      const newVoiceKeys = new Map(
        draft.sentences.map((sentence, index) => [sentence.id, `new-voice-audio-${index}`]),
      );
      await repository.storeAudio(audio(1, 'new-voice-audio-1'), newVoiceKeys);

      const reading = await readings.getReading(draft.reading.id);

      // Two rows exist for this reading; exactly one is current.
      expect(await db.audioAssets.count()).toBe(2);
      expect(reading.ok && reading.value?.audioSummary).toEqual({
        total: draft.sentences.length,
        completed: 1,
        failed: 0,
      });
    });

    it('refreshes the reading summary inside the same transaction as the write', async () => {
      const cacheKeys = currentAudioKeys();
      await repository.storeAudio(audio(0), cacheKeys);
      await repository.storeAudio(audio(1, 'audio-1'), cacheKeys);

      const reading = await readings.getReading(draft.reading.id);

      expect(reading.ok && reading.value?.audioSummary).toEqual({
        total: draft.sentences.length,
        completed: 2,
        failed: 0,
      });
    });

    it('lists only the sentences with no clip under the current keys', async () => {
      const cacheKeys = currentAudioKeys();
      await repository.storeAudio(audio(0), cacheKeys);

      const missing = await repository.listSentenceIdsMissingAudio(draft.reading.id, cacheKeys);

      expect(missing.ok).toBe(true);
      if (!missing.ok) {
        return;
      }
      expect(missing.value).toEqual(draft.sentences.slice(1).map((sentence) => sentence.id));
    });

    it('counts a stored clip as missing once the voice has changed', async () => {
      await repository.storeAudio(audio(0), currentAudioKeys());

      const staleKeys = new Map(
        draft.sentences.map((sentence, index) => [sentence.id, `other-audio-${index}`]),
      );
      const missing = await repository.listSentenceIdsMissingAudio(draft.reading.id, staleKeys);

      expect(missing.ok && missing.value).toHaveLength(draft.sentences.length);
    });
  });

  describe('bounded audio metadata reads', () => {
    it('reads only the requested clips, not the whole reading', async () => {
      const cacheKeys = currentAudioKeys();
      await repository.storeAudio(audio(0), cacheKeys);
      await repository.storeAudio(audio(1, 'audio-1'), cacheKeys);
      await repository.storeAudio(audio(2, 'audio-2'), cacheKeys);

      const bounded = await repository.listAudioSummariesForCacheKeys(['audio-1']);

      expect(bounded.ok).toBe(true);
      if (!bounded.ok) {
        return;
      }
      expect(bounded.value.map((summary) => summary.sentenceId)).toEqual([draft.sentences[1].id]);
    });

    /**
     * The windowed reader calls this on every paragraph-window change. Pulling
     * blobs would mean loading megabytes of MP3 to decide whether to print the
     * word "Play".
     */
    it('goes through the primary key and returns no blob', async () => {
      const cacheKeys = currentAudioKeys();
      await repository.storeAudio(audio(0), cacheKeys);
      await repository.storeAudio(audio(1, 'audio-1'), cacheKeys);
      const where = vi.spyOn(db.audioAssets, 'where');

      const bounded = await repository.listAudioSummariesForCacheKeys(['audio-0']);

      expect(where).toHaveBeenCalledWith(':id');
      expect(bounded.ok).toBe(true);
      if (!bounded.ok) {
        return;
      }
      for (const summary of bounded.value) {
        expect('blob' in summary).toBe(false);
        expect('bytes' in summary).toBe(false);
      }
    });

    it('answers with nothing for a key that has no clip', async () => {
      const bounded = await repository.listAudioSummariesForCacheKeys(['audio-0']);

      expect(bounded.ok && bounded.value).toEqual([]);
    });
  });

  /**
   * `audioAssets` is keyed by `cacheKey`, so two sentences with identical
   * Japanese share one clip and therefore one row — which is the point of a
   * content-addressed cache.
   *
   * Counting rows rather than covered sentences reported such a reading as
   * permanently one clip short: the menu kept offering to prepare audio, each
   * run synthesized nothing because nothing was missing, and the Play gate
   * never opened. Sentences like `はい。` repeat in real Japanese text, so this
   * was not a corner case.
   */
  describe('sentences that share a clip', () => {
    /** Maps two sentences onto one key, as identical Japanese would. */
    function sharedKeys(): Map<(typeof draft.sentences)[number]['id'], string> {
      const keys = currentAudioKeys();
      keys.set(draft.sentences[1].id, 'audio-0');
      return keys;
    }

    it('counts both sentences as complete from the one stored clip', async () => {
      const cacheKeys = sharedKeys();

      await repository.storeAudio(audio(0), cacheKeys);
      await repository.storeAudio(audio(2, 'audio-2'), cacheKeys);

      expect(await db.audioAssets.count()).toBe(2);
      const reading = await readings.getReading(draft.reading.id);
      expect(reading.ok && reading.value?.audioSummary).toEqual({
        total: draft.sentences.length,
        completed: draft.sentences.length,
        failed: 0,
      });
    });

    it('lists neither of them as missing once the shared clip exists', async () => {
      const cacheKeys = sharedKeys();
      await repository.storeAudio(audio(0), cacheKeys);

      const missing = await repository.listSentenceIdsMissingAudio(draft.reading.id, cacheKeys);

      expect(missing.ok && missing.value).toEqual([draft.sentences[2].id]);
    });

    it('finds the shared clip for the sentence that has no row of its own', async () => {
      await repository.storeAudio(audio(0), sharedKeys());

      const bounded = await repository.listAudioSummariesForCacheKeys(['audio-0']);

      expect(bounded.ok && bounded.value).toHaveLength(1);
    });
  });

  it('deletes a single audio clip without touching translations', async () => {
    const asset = audio(0);
    await repository.storeAudio(asset, currentAudioKeys());
    await repository.storeTranslation(translation(0), currentTranslationKeys());

    await repository.deleteAudio(asset.id);

    expect(await db.audioAssets.count()).toBe(0);
    expect(await db.translations.count()).toBe(1);
  });
});
