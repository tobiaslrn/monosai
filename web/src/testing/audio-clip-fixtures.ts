import type { AudioAssetSummary } from '../app/domain/enrichment/records';
import type { Reading } from '../app/domain/reading/reading';
import type { SentenceRef } from '../app/domain/reading/reading-repository';
import { assetId, type SentenceId } from '../app/domain/shared/ids';
import { importedReadingFixture, uuid } from './persistence-fixtures';

/** A reading of `count` one-line sentences and the refs playback reads for it. */
export function clipReadingFixture(count = 4): {
  readonly reading: Reading;
  readonly refs: readonly SentenceRef[];
} {
  const draft = importedReadingFixture({
    paragraphTexts: [Array.from({ length: count }, (_, index) => `文${String(index)}です。`)],
  });
  return {
    reading: draft.reading,
    refs: draft.sentences.map((sentence) => ({
      id: sentence.id,
      contentHash: sentence.contentHash,
      positionInReading: sentence.positionInReading,
    })),
  };
}

/** Cache keys for a configuration, named so a spec can tell two apart. */
export function cacheKeysFixture(
  refs: readonly SentenceRef[],
  configuration = 'current',
): ReadonlyMap<SentenceId, string> {
  return new Map(refs.map((ref, index) => [ref.id, `${configuration}:${String(index)}`]));
}

/** The stored row for one sentence's clip, as the audio list reads it. */
export function audioSummaryFixture(
  reading: Reading,
  ref: SentenceRef,
  cacheKey: string,
  options: {
    readonly pace?: 'playback' | null;
    readonly createdAt?: number;
    readonly mimeType?: AudioAssetSummary['mimeType'];
  } = {},
): AudioAssetSummary {
  const pace = options.pace === undefined ? 'playback' : options.pace;
  return {
    id: assetId(uuid(9000 + ref.positionInReading)),
    sentenceId: ref.id,
    readingId: reading.id,
    sourceContentHash: ref.contentHash,
    modelId: 'vendor/tts',
    voiceId: 'voice-a',
    optionsFingerprint: 'fingerprint',
    ...(pace === null ? {} : { pace }),
    mimeType: options.mimeType ?? 'audio/mpeg',
    byteLength: 4,
    cacheKey,
    createdAt: options.createdAt ?? 1_700_600_000_000 + ref.positionInReading,
  };
}
