import { describe, expect, it } from 'vitest';
import type { ExceptionReviewRequest } from '../../../domain/ai/text-generation-provider';
import { buildExceptionPrompt } from './exception-prompt';

describe('buildExceptionPrompt', () => {
  it('includes lemma, reading, and part of speech when a candidate has them', () => {
    const request: ExceptionReviewRequest = {
      policyText: 'Allow place names.',
      candidates: [
        {
          id: 'candidate-1',
          surface: '図書館',
          lemma: '図書館',
          readingHiragana: 'としょかん',
          partOfSpeech: 'noun',
          contextsJa: ['図書館へ行った。'],
        },
      ],
      promptVersion: 'exception-review/1',
    };

    const prompt = buildExceptionPrompt(request);

    expect(prompt.user).toContain('"lemma":"図書館"');
    expect(prompt.user).toContain('"readingHiragana":"としょかん"');
    expect(prompt.user).toContain('"partOfSpeech":"noun"');
  });

  it('omits lemma, reading, and part of speech when a candidate lacks them', () => {
    const request: ExceptionReviewRequest = {
      policyText: 'Allow place names.',
      candidates: [
        {
          id: 'candidate-2',
          surface: 'にゃー',
          contextsJa: ['にゃーと鳴いた。'],
        },
      ],
      promptVersion: 'exception-review/1',
    };

    const prompt = buildExceptionPrompt(request);

    expect(prompt.user).not.toContain('"lemma"');
    expect(prompt.user).not.toContain('"readingHiragana"');
    expect(prompt.user).not.toContain('"partOfSpeech"');
  });
});
