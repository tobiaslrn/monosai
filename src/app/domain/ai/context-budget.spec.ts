import { describe, expect, it } from 'vitest';
import { snapshotId } from '../shared/ids';
import {
  FIXED_PROMPT_OVERHEAD_TOKENS,
  MAX_REQUEST_TOKENS,
  checkContextBudget,
  estimateRequestTokens,
  estimateTokens,
} from './context-budget';
import { sentenceRangeForCount, type StoryGenerationRequest } from './story-request';

function request(overrides: Partial<StoryGenerationRequest> = {}): StoryGenerationRequest {
  return {
    form: 'micro',
    sentenceRange: sentenceRangeForCount(5),
    premise: '猫が旅に出る話。',
    allowedVocabulary: ['猫', '旅', '出る'],
    suggestedVocabulary: ['猫'],
    structuralBaseline: ['は', 'を', 'です'],
    grammarGuidance: 'Write single short clauses.',
    registerPreference: 'either',
    snapshotId: snapshotId('00000000-0000-4000-8000-000000000001'),
    grammarProfileHash: 'hash',
    promptVersion: 'story/1',
    ...overrides,
  };
}

describe('estimateTokens', () => {
  it('is deterministic for the same text', () => {
    expect(estimateTokens('猫が旅に出る')).toBe(estimateTokens('猫が旅に出る'));
  });

  it('counts Japanese near one token per character and ASCII near a quarter', () => {
    expect(estimateTokens('猫が旅に出る')).toBe(6);
    expect(estimateTokens('abcdefgh')).toBe(2);
  });

  it('counts nothing for empty text', () => {
    expect(estimateTokens('')).toBe(0);
  });
});

describe('estimateRequestTokens', () => {
  it('grows with the allowlist rather than ignoring it', () => {
    const small = estimateRequestTokens(request());
    const large = estimateRequestTokens(
      request({ allowedVocabulary: Array.from({ length: 1_800 }, () => '勉強') }),
    );

    expect(large).toBeGreaterThan(small);
  });

  it('includes the fixed protocol and policy layers', () => {
    expect(
      estimateRequestTokens(
        request({
          premise: '',
          allowedVocabulary: [],
          suggestedVocabulary: [],
          structuralBaseline: [],
          grammarGuidance: '',
        }),
      ),
    ).toBe(FIXED_PROMPT_OVERHEAD_TOKENS);
  });

  it('fits the supported vocabulary range comfortably inside the budget', () => {
    const full = request({
      allowedVocabulary: Array.from({ length: 1_800 }, () => '国際交流基金'),
      suggestedVocabulary: Array.from({ length: 100 }, () => '国際交流基金'),
      structuralBaseline: Array.from({ length: 177 }, () => 'なければならない'),
    });

    expect(estimateRequestTokens(full)).toBeLessThan(MAX_REQUEST_TOKENS);
  });
});

describe('checkContextBudget', () => {
  it('reports the estimate when the request fits', () => {
    const result = checkContextBudget(request(), 'story-generation');

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.limit).toBe(MAX_REQUEST_TOKENS);
    expect(result.value.estimatedTokens).toBeGreaterThan(0);
  });

  it('fails before spending when the assembled request is too large', () => {
    const result = checkContextBudget(
      request({ allowedVocabulary: Array.from({ length: 100_000 }, () => '猫') }),
      'story-generation',
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe('context-budget-exceeded');
    expect(result.error.task).toBe('story-generation');
  });
});
