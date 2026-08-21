import { Injectable, inject } from '@angular/core';
import {
  audioCacheKey,
  grammarCacheKey,
  translationCacheKey,
} from '../../domain/enrichment/cache-keys';
import type { SentenceId } from '../../domain/shared/ids';
import { HASHER } from '../shared/repository-tokens';

/** The part of a sentence a cache key is derived from. */
export interface KeyableSentence {
  readonly id: SentenceId;
  readonly contentHash: string;
}

/**
 * Computes the per-sentence cache keys grammar review, translation, and audio
 * key their cached results on.
 *
 * A sentence's cache key needs its real content hash, which only exists once
 * `StoryAssemblyService.build` has produced the draft — so this service is
 * always called after `build`, never before.
 *
 * The input is only the identity and content hash a key is derived from, so a
 * whole-reading job can key every sentence from `listSentenceRefs` without
 * loading a single line of Japanese.
 */
@Injectable({ providedIn: 'root' })
export class EnrichmentKeysService {
  private readonly hasher = inject(HASHER);

  translationKeys(
    sentences: readonly KeyableSentence[],
    modelId: string,
    promptVersion: string,
  ): ReadonlyMap<SentenceId, string> {
    return new Map(
      sentences.map((sentence) => [
        sentence.id,
        translationCacheKey(this.hasher, sentence.contentHash, modelId, promptVersion),
      ]),
    );
  }

  grammarKeys(
    sentences: readonly KeyableSentence[],
    modelId: string,
    promptVersion: string,
    profileHash: string,
  ): ReadonlyMap<SentenceId, string> {
    return new Map(
      sentences.map((sentence) => [
        sentence.id,
        grammarCacheKey(this.hasher, sentence.contentHash, profileHash, modelId, promptVersion),
      ]),
    );
  }

  /**
   * There is no prompt version here: a clip is what a voice did with a sentence,
   * not what a prompt asked a model to say about it. Everything that changes the
   * audio is in `optionsFingerprint` instead.
   */
  audioKeys(
    sentences: readonly KeyableSentence[],
    modelId: string,
    voiceId: string,
    optionsFingerprint: string,
  ): ReadonlyMap<SentenceId, string> {
    return new Map(
      sentences.map((sentence) => [
        sentence.id,
        audioCacheKey(this.hasher, sentence.contentHash, modelId, voiceId, optionsFingerprint),
      ]),
    );
  }
}
