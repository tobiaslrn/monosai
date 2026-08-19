import { describe, expect, it } from 'vitest';
import { ALL_AI_ERROR_CODES, aiError } from '../../domain/ai/ai-error';
import { AI_ERROR_COPY, aiErrorCopy } from './ai-error-copy';

describe('AI_ERROR_COPY', () => {
  it('gives every failure variant its own words', () => {
    for (const code of ALL_AI_ERROR_CODES) {
      const copy = AI_ERROR_COPY[code];

      expect(copy.heading.length).toBeGreaterThan(0);
      expect(copy.whatFailed.length).toBeGreaterThan(0);
      expect(copy.whatDidNot.length).toBeGreaterThan(0);
      expect(copy.primaryAction.length).toBeGreaterThan(0);
      expect(copy.escape.length).toBeGreaterThan(0);
    }
  });

  it('describes each failure distinctly', () => {
    const headings = ALL_AI_ERROR_CODES.map((code) => AI_ERROR_COPY[code].heading);

    expect(new Set(headings).size).toBe(headings.length);
  });

  it('always says the failure changed nothing', () => {
    for (const code of ALL_AI_ERROR_CODES) {
      expect(AI_ERROR_COPY[code].whatDidNot).toContain('Nothing was changed');
    }
  });

  it('resolves copy from an error value', () => {
    expect(aiErrorCopy(aiError('authentication', 'text-model-test', 'x')).heading).toBe(
      AI_ERROR_COPY.authentication.heading,
    );
  });
});
