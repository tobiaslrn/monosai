import { describe, expect, it } from 'vitest';
import { ALL_AI_ERROR_CODES, aiError } from '../../domain/ai/ai-error';
import { ALL_AI_TASKS } from '../../domain/ai/ai-task';
import {
  AI_ERROR_COPY,
  AI_TASK_COPY,
  aiErrorAction,
  aiErrorCopy,
  aiFailureMessage,
  aiTaskCopy,
  type AiFailureSurface,
} from './ai-error-copy';

const SURFACES: readonly AiFailureSurface[] = ['settings-test', 'reader'];

describe('AI_ERROR_COPY', () => {
  it('gives every failure variant its own words', () => {
    for (const code of ALL_AI_ERROR_CODES) {
      const copy = AI_ERROR_COPY[code];

      expect(copy.heading.length).toBeGreaterThan(0);
      expect(copy.whatFailed.length).toBeGreaterThan(0);
      expect(copy.whatDidNot.length).toBeGreaterThan(0);
      expect(copy.primaryAction.length).toBeGreaterThan(0);
      expect(copy.retryAction.length).toBeGreaterThan(0);
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

  it('does not describe a TTS capability failure as a structured-text failure', () => {
    const copy = aiErrorCopy(aiError('capability-unsupported', 'tts-test', 'x'));

    expect(copy.primaryAction).toContain('TTS model and voice');
    expect(copy.retryAction).toContain('TTS model and voice');
    expect(copy.escape).not.toContain('structured replies');
  });

  it('tells an exhausted account to add credit rather than re-save a working key', () => {
    const copy = AI_ERROR_COPY['credit-exhausted'];

    for (const line of [copy.heading, copy.whatFailed, copy.primaryAction, copy.retryAction]) {
      expect(line.toLowerCase()).not.toContain('rejected');
    }
    expect(copy.primaryAction.toLowerCase()).toContain('add credit');
    expect(copy.retryAction.toLowerCase()).toContain('add credit');
    expect(copy.heading.toLowerCase()).toContain('credit');
  });

  it('keeps a rejected key about the key, now that credit has its own variant', () => {
    const copy = AI_ERROR_COPY.authentication;

    expect(copy.whatFailed.toLowerCase()).toContain('rejected');
    expect(copy.whatFailed.toLowerCase()).not.toContain('credit');
  });
});

/**
 * Every failure, during every task, on every surface.
 *
 * The classification is shared, so what these check is that the surface only
 * ever changes the next step, and that the reader's next step never names a
 * control the reader does not have.
 */
describe('aiFailureMessage', () => {
  it('names the failure, the interrupted task, and a next step everywhere', () => {
    for (const code of ALL_AI_ERROR_CODES) {
      for (const task of ALL_AI_TASKS) {
        for (const surface of SURFACES) {
          const error = aiError(code, task, 'raw provider wording');
          const message = aiFailureMessage(error, surface);
          const where = `${code}/${task}/${surface}`;

          expect(message.startsWith(aiErrorCopy(error).heading), where).toBe(true);
          expect(message, where).toContain(`while ${AI_TASK_COPY[task]}.`);
          expect(message.endsWith(aiErrorAction(error, surface)), where).toBe(true);
          expect(message, where).not.toContain('raw provider wording');
        }
      }
    }
  });

  it('never sends a reader to a test that only exists in Settings', () => {
    for (const code of ALL_AI_ERROR_CODES) {
      for (const task of ALL_AI_TASKS) {
        const action = aiErrorAction(aiError(code, task, 'x'), 'reader');

        expect(action.toLowerCase(), `${code}/${task}`).not.toMatch(/\btests?\b/);
        expect(action.trim().length, `${code}/${task}`).toBeGreaterThan(0);
        expect(action.endsWith('.'), `${code}/${task}`).toBe(true);
      }
    }
  });

  it('offers the settings panel its own control instead', () => {
    const testActions = ALL_AI_ERROR_CODES.map((code) => AI_ERROR_COPY[code].primaryAction);

    expect(testActions.some((action) => /\btest\b/i.test(action))).toBe(true);
  });

  it('reads as one classification with two next steps', () => {
    const error = aiError('rate-limited', 'translation', 'x');

    expect(aiFailureMessage(error, 'reader')).toBe(
      'OpenRouter is rate limiting this key while translating this sentence. Wait a moment, then try again.',
    );
    expect(aiFailureMessage(error, 'settings-test')).toBe(
      'OpenRouter is rate limiting this key while translating this sentence. Wait a moment, then run the test again.',
    );
  });

  it('does not report a cancellation in the reader as a cancelled test', () => {
    const message = aiFailureMessage(aiError('cancelled', 'tts-synthesis', 'x'), 'reader');

    expect(message.toLowerCase()).not.toMatch(/\btests?\b/);
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
