import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  audioCacheKey,
  grammarCacheKey,
  translationCacheKey,
} from '../../domain/enrichment/cache-keys';
import type { Sentence } from '../../domain/reading/text-hierarchy';
import type { Hasher } from '../../domain/shared/hashing';
import { paragraphId, readingId, sentenceId } from '../../domain/shared/ids';
import { HASHER } from '../shared/repository-tokens';
import { EnrichmentKeysService } from './enrichment-keys.service';

const TEST_HASHER: Hasher = { algorithm: 'test', hashText: (text) => `h(${text})` };

function sentence(id: string, contentHash: string): Sentence {
  return {
    id: sentenceId(id),
    readingId: readingId('r1'),
    paragraphId: paragraphId('p1'),
    positionInReading: 0,
    positionInParagraph: 0,
    japaneseText: 'ねこがいます。',
    contentHash,
  };
}

describe('EnrichmentKeysService', () => {
  let service: EnrichmentKeysService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [EnrichmentKeysService, { provide: HASHER, useValue: TEST_HASHER }],
    });
    service = TestBed.inject(EnrichmentKeysService);
  });

  it('computes one translation cache key per sentence, matching the domain function', () => {
    const sentences = [sentence('s1', 'hash-1'), sentence('s2', 'hash-2')];

    const keys = service.translationKeys(sentences, 'vendor/model', 'translation/1');

    expect(keys.size).toBe(2);
    expect(keys.get(sentenceId('s1'))).toBe(
      translationCacheKey(TEST_HASHER, 'hash-1', 'vendor/model', 'translation/1', null, 'hash-2'),
    );
    expect(keys.get(sentenceId('s2'))).toBe(
      translationCacheKey(TEST_HASHER, 'hash-2', 'vendor/model', 'translation/1', 'hash-1', null),
    );
  });

  it('computes one grammar cache key per sentence, matching the domain function', () => {
    const sentences = [sentence('s1', 'hash-1')];

    const keys = service.grammarKeys(sentences, 'vendor/model', 'grammar/1', 'profile-hash');

    expect(keys.get(sentenceId('s1'))).toBe(
      grammarCacheKey(TEST_HASHER, 'hash-1', 'profile-hash', 'vendor/model', 'grammar/1'),
    );
  });

  it('computes one audio cache key per sentence, matching the domain function', () => {
    const sentences = [sentence('s1', 'hash-1'), sentence('s2', 'hash-2')];

    const keys = service.audioKeys(sentences, 'vendor/tts', 'voice-a', 'options-fp');

    expect(keys.size).toBe(2);
    expect(keys.get(sentenceId('s1'))).toBe(
      audioCacheKey(TEST_HASHER, 'hash-1', 'vendor/tts', 'voice-a', 'options-fp'),
    );
    expect(keys.get(sentenceId('s2'))).toBe(
      audioCacheKey(TEST_HASHER, 'hash-2', 'vendor/tts', 'voice-a', 'options-fp'),
    );
  });

  it('gives a sentence a different audio key for a different voice', () => {
    const sentences = [sentence('s1', 'hash-1')];

    const first = service.audioKeys(sentences, 'vendor/tts', 'voice-a', 'options-fp');
    const second = service.audioKeys(sentences, 'vendor/tts', 'voice-b', 'options-fp');

    expect(first.get(sentenceId('s1'))).not.toBe(second.get(sentenceId('s1')));
  });

  it('includes neighbor hashes only when contextual speech instructions are supported', () => {
    const sentences = [
      sentence('s1', 'hash-1'),
      sentence('s2', 'hash-2'),
      sentence('s3', 'hash-3'),
    ];
    const contextual = service.audioKeys(
      sentences,
      'vendor/tts',
      'voice-a',
      'options-fp',
      'supported',
    );
    const exactText = service.audioKeys(
      sentences,
      'vendor/tts',
      'voice-a',
      'options-fp',
      'unsupported',
    );

    expect(contextual.get(sentenceId('s2'))).toBe(
      audioCacheKey(
        TEST_HASHER,
        'hash-2',
        'vendor/tts',
        'voice-a',
        'options-fp',
        'hash-1',
        'hash-3',
      ),
    );
    expect(contextual.get(sentenceId('s2'))).not.toBe(exactText.get(sentenceId('s2')));
  });

  /**
   * A whole-reading job keys every sentence from `listSentenceRefs`, which
   * carries identity and content hash and no Japanese at all.
   */
  it('keys a sentence from its id and content hash alone', () => {
    const ref = { id: sentenceId('s1'), contentHash: 'hash-1' };

    const keys = service.audioKeys([ref], 'vendor/tts', 'voice-a', 'options-fp');

    expect(keys.get(sentenceId('s1'))).toBe(
      audioCacheKey(TEST_HASHER, 'hash-1', 'vendor/tts', 'voice-a', 'options-fp'),
    );
  });

  it('changes the key when the content hash changes', () => {
    const first = service.translationKeys(
      [sentence('s1', 'hash-a')],
      'vendor/model',
      'translation/1',
    );
    const second = service.translationKeys(
      [sentence('s1', 'hash-b')],
      'vendor/model',
      'translation/1',
    );

    expect(first.get(sentenceId('s1'))).not.toBe(second.get(sentenceId('s1')));
  });
});
