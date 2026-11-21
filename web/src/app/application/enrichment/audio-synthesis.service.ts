import { sentencesWithoutStoredAid, stillMissing } from '../../domain/enrichment/preparation';
import { Injectable, inject } from '@angular/core';
import type { AiError } from '../../domain/ai/ai-error';
import type {
  SpeechContext,
  SpeechInstructionsSupport,
  SpeechPace,
  SpeechStyle,
} from '../../domain/ai/speech-instructions';
import type { AudioAsset, AudioAssetSummary } from '../../domain/enrichment/records';
import type { Sentence } from '../../domain/reading/text-hierarchy';
import { assetId, type ReadingId, type SentenceId } from '../../domain/shared/ids';
import { err, ok, type Result } from '../../domain/shared/result';
import type { StorageError } from '../../domain/storage/storage-error';
import { TEXT_TO_SPEECH_PROVIDER } from '../shared/ai-tokens';
import { CLOCK, ENRICHMENT_REPOSITORY, ID_GENERATOR } from '../shared/repository-tokens';

/** The model, voice, named pace, and delivery channel one synthesis runs under. */
export interface AudioSynthesisConfig {
  readonly modelId: string;
  readonly voiceId: string;
  readonly speechStyle: SpeechStyle;
  readonly speechPace: SpeechPace;
  readonly speechInstructions: SpeechInstructionsSupport;
  readonly optionsFingerprint: string;
}

export function speechContextFor(
  sentence: Sentence,
  orderedSentences: readonly Sentence[],
): SpeechContext {
  const ordered = [...orderedSentences].sort(
    (left, right) => left.positionInReading - right.positionInReading,
  );
  const index = ordered.findIndex((item) => item.id === sentence.id);
  if (index < 0) {
    return {};
  }
  const beforeJa = ordered[index - 1]?.japaneseText;
  const afterJa = ordered[index + 1]?.japaneseText;
  return {
    ...(beforeJa === undefined ? {} : { beforeJa }),
    ...(afterJa === undefined ? {} : { afterJa }),
  };
}

/** MP3 is what is requested and what the audio cache stores. */
const RESPONSE_FORMAT = 'mp3';

/**
 * One sentence, one clip.
 *
 * Split into `run` and `store` for the reason ADR 0021 gives for translation:
 * `run` produces a record without writing anything, so a cancelled or refused
 * attempt cannot leave a row behind, and `store` is the single place a clip and
 * its reading's summary are committed together.
 *
 * There is no batching helper. The speech endpoint takes one input per request,
 * so a batch here would be a loop pretending to be a request. Running several
 * of them at once is the job's business, not this service's: `run` holds no
 * state between calls and is safe to have several of in flight.
 */
@Injectable({ providedIn: 'root' })
export class AudioSynthesisService {
  private readonly provider = inject(TEXT_TO_SPEECH_PROVIDER);
  private readonly enrichment = inject(ENRICHMENT_REPOSITORY);
  private readonly clock = inject(CLOCK);
  private readonly ids = inject(ID_GENERATOR);

  /**
   * Produces one clip, from the cache when there is one.
   *
   * A cache hit keeps the stored clip, which the key fully identifies, but is
   * addressed to this sentence and reading. The key never names the reading,
   * so the row may have been written for the same sentence in another one;
   * storing it unaddressed would refresh that other reading's summary with
   * this reading's keys and leave this one uncounted
   * ([ADR 0096](../../../../../docs/decisions/0096-shared-aids-are-counted-by-key-and-outlive-one-reading.md)).
   */
  async run(
    sentence: Sentence,
    readingId: ReadingId,
    cacheKey: string,
    config: AudioSynthesisConfig,
    signal: AbortSignal,
    context: SpeechContext = {},
  ): Promise<Result<AudioAsset, AiError>> {
    const cached = await this.enrichment.getAudioByCacheKey(cacheKey);
    if (cached.ok && cached.value !== null) {
      return ok({
        ...cached.value,
        sentenceId: sentence.id,
        readingId,
        sourceContentHash: sentence.contentHash,
      });
    }

    const payload = await this.provider.synthesize(
      {
        text: sentence.japaneseText,
        modelId: config.modelId,
        voiceId: config.voiceId,
        speechStyle: config.speechStyle,
        speechPace: config.speechPace,
        responseFormat: RESPONSE_FORMAT,
        speechInstructions: config.speechInstructions,
        ...(context.beforeJa === undefined ? {} : { beforeJa: context.beforeJa }),
        ...(context.afterJa === undefined ? {} : { afterJa: context.afterJa }),
      },
      signal,
    );
    if (!payload.ok) {
      return err(payload.error);
    }

    return ok({
      id: assetId(this.ids.nextId()),
      sentenceId: sentence.id,
      readingId,
      sourceContentHash: sentence.contentHash,
      modelId: config.modelId,
      voiceId: config.voiceId,
      optionsFingerprint: config.optionsFingerprint,
      pace: 'playback',
      mimeType: payload.value.mimeType,
      byteLength: payload.value.bytes.byteLength,
      blob: new Blob([payload.value.bytes], { type: payload.value.mimeType }),
      cacheKey,
      createdAt: this.clock.now(),
    });
  }

  /** Writes the clip and refreshes the reading's summary in one transaction. */
  store(
    asset: AudioAsset,
    currentCacheKeys: ReadonlyMap<SentenceId, string>,
  ): Promise<Result<AudioAssetSummary, StorageError>> {
    return this.enrichment.storeAudio(asset, currentCacheKeys);
  }

  /** Counts the reading's summary again by its current keys, storing nothing. */
  recountSummary(
    readingId: ReadingId,
    currentCacheKeys: ReadonlyMap<SentenceId, string>,
  ): Promise<Result<void, StorageError>> {
    return this.enrichment.recountAudioSummary(readingId, currentCacheKeys);
  }

  /**
   * Which sentences have no clip under the current keys.
   *
   * Completeness is "a row exists whose cache key is the current key for that
   * sentence", so changing the voice makes every sentence missing again without
   * deleting a clip the learner already paid for.
   */
  missingSentenceIds(
    readingId: ReadingId,
    currentCacheKeys: ReadonlyMap<SentenceId, string>,
  ): Promise<Result<readonly SentenceId[], StorageError>> {
    return this.enrichment.listSentenceIdsMissingAudio(readingId, currentCacheKeys);
  }

  /**
   * Sentences that have never been read aloud, under any configuration.
   *
   * What the preparation lane queues, as opposed to what *Prepare again* asks:
   * a cache key changes with the model, and a reading already prepared must not
   * be prepared a second time because the learner picked a different one.
   * A clip under the current key counts even when it was written for the same
   * sentence in another reading: it plays here as it is.
   */
  async neverPreparedSentenceIds(
    readingId: ReadingId,
    cacheKeys: ReadonlyMap<SentenceId, string>,
  ): Promise<Result<readonly SentenceId[], StorageError>> {
    const [stored, missing] = await Promise.all([
      this.enrichment.listSentenceIdsWithStoredAudio([...cacheKeys.keys()]),
      this.enrichment.listSentenceIdsMissingAudio(readingId, cacheKeys),
    ]);
    if (!stored.ok) return stored;
    if (!missing.ok) return missing;
    return ok(stillMissing(sentencesWithoutStoredAid(cacheKeys, stored.value), missing.value));
  }
}
