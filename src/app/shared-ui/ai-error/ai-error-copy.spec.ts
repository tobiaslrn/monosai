import { describe, expect, it } from 'vitest';
import { ALL_AI_ERROR_CODES, aiError } from '../../domain/ai/ai-error';
import { ALL_AI_TASKS } from '../../domain/ai/ai-task';
import { AI_ERROR_COPY, AI_TASK_COPY, aiErrorCopy, aiTaskCopy } from './ai-error-copy';

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

describe('AI_TASK_COPY', () => {
  it('names every task the application can fail during', () => {
    for (const task of ALL_AI_TASKS) {
      expect(AI_TASK_COPY[task].length).toBeGreaterThan(0);
    }
  });

  it('describes each task distinctly', () => {
    const phrases = ALL_AI_TASKS.map((task) => AI_TASK_COPY[task]);

    expect(new Set(phrases).size).toBe(phrases.length);
  });

  it('resolves the phrase from an error value', () => {
    expect(aiTaskCopy(aiError('timeout', 'story-repair', 'x').task)).toBe(
      AI_TASK_COPY['story-repair'],
    );
  });
});
