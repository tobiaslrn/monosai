import { Injectable, inject } from '@angular/core';
import { grammarCacheKey, translationCacheKey } from '../../domain/enrichment/cache-keys';
import type { Sentence } from '../../domain/reading/text-hierarchy';
import type { SentenceId } from '../../domain/shared/ids';
import { HASHER } from '../shared/repository-tokens';

/**
 * Computes the per-sentence cache keys grammar review and translation key
 * their cached results on.
 *
 * A sentence's cache key needs its real content hash, which only exists once
 * `StoryAssemblyService.build` has produced the draft — so this service is
 * always called after `build`, never before.
 */
@Injectable({ providedIn: 'root' })
export class EnrichmentKeysService {
  private readonly hasher = inject(HASHER);

  translationKeys(
    sentences: readonly Sentence[],
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
    sentences: readonly Sentence[],
    modelId: string,
    promptVersion: string,
    profileHash: string,
  ): ReadonlyMap<SentenceId, string> {
    return new Map(
      sentences.map((sentence) => [
        sentence.id,
        grammarCacheKey(
          this.hasher,
          sentence.contentHash,
          profileHash,
          modelId,
          promptVersion,
        ),
      ]),
    );
  }
}
