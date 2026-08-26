import { Injectable, inject } from '@angular/core';
import type { AiError } from '../../domain/ai/ai-error';
import type { SpeechContext, SpeechInstructionsSupport } from '../../domain/ai/speech-instructions';
import type { AudioAsset, AudioAssetSummary } from '../../domain/enrichment/records';
import type { Sentence } from '../../domain/reading/text-hierarchy';
import { assetId, type ReadingId, type SentenceId } from '../../domain/shared/ids';
import { err, ok, type Result } from '../../domain/shared/result';
import type { StorageError } from '../../domain/storage/storage-error';
import { TEXT_TO_SPEECH_PROVIDER } from '../shared/ai-tokens';
import { CLOCK, ENRICHMENT_REPOSITORY, ID_GENERATOR } from '../shared/repository-tokens';

/** The configuration one synthesis runs under, captured before the request. */
export interface AudioSynthesisConfig {
  readonly modelId: string;
  readonly voiceId: string;
  readonly speed: number;
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
  return { beforeJa, afterJa };
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
   * A cache hit is returned as the stored asset itself rather than rebuilt:
   * unlike a translation, whose English can be reused for identical Japanese in
   * another reading, a clip's key already carries everything that identifies it
   * and the stored row is the row this sentence wants.
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
      return ok(cached.value);
    }

    const payload = await this.provider.synthesize(
      {
        text: sentence.japaneseText,
        modelId: config.modelId,
        voiceId: config.voiceId,
        speed: config.speed,
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
}
