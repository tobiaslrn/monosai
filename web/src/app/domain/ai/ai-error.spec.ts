import { describe, expect, it } from 'vitest';
import { assertNever } from '../shared/exhaustive';
import { technicalCode } from '../shared/errors';
import {
  ALL_AI_ERROR_CODES,
  aiError,
  isAutomaticallyRetryable,
  type AiErrorCode,
} from './ai-error';

describe('aiError', () => {
  it('builds a redacted error carrying its task', () => {
    const error = aiError('authentication', 'text-model-test', 'The provider rejected the key.');

    expect(error).toEqual({
      domain: 'ai',
      code: 'authentication',
      task: 'text-model-test',
      message: 'The provider rejected the key.',
    });
    expect(technicalCode(error)).toBe('ai/authentication');
  });

  it('omits absent cause and detail rather than storing undefined', () => {
    const error = aiError('timeout', 'tts-test', 'The request timed out.');

    expect('cause' in error).toBe(false);
    expect('detail' in error).toBe(false);
  });

  it('keeps structured detail separate from the message', () => {
    const error = aiError('model-not-found', 'text-model-test', 'The model does not exist.', {
      detail: { modelId: 'vendor/model', status: 404 },
      cause: 'HTTP 404',
    });

    expect(error.detail).toEqual({ modelId: 'vendor/model', status: 404 });
    expect(error.cause).toBe('HTTP 404');
  });
});

describe('AiErrorCode', () => {
  it('lists every variant exactly once', () => {
    expect(new Set(ALL_AI_ERROR_CODES).size).toBe(ALL_AI_ERROR_CODES.length);
  });

  it('has a documented retry decision for every variant', () => {
    const decide = (code: AiErrorCode): boolean => {
      switch (code) {
        case 'rate-limited':
        case 'provider-unavailable':
        case 'timeout':
          return true;
        case 'offline':
        case 'cancelled':
        case 'authentication':
        case 'credit-exhausted':
        case 'model-not-found':
        case 'capability-unsupported':
        case 'malformed-response':
        case 'context-budget-exceeded':
        case 'audio-invalid':
        case 'unknown':
          return false;
        default:
          return assertNever(code, 'retry decision');
      }
    };

    for (const code of ALL_AI_ERROR_CODES) {
      expect(isAutomaticallyRetryable(aiError(code, 'text-model-test', 'x'))).toBe(decide(code));
    }
  });

  it('never retries a failure the learner has to fix', () => {
    for (const code of [
      'authentication',
      'credit-exhausted',
      'model-not-found',
      'capability-unsupported',
    ] as const) {
      expect(isAutomaticallyRetryable(aiError(code, 'text-model-test', 'x'))).toBe(false);
    }
  });

  it('never retries a cancelled request', () => {
    expect(isAutomaticallyRetryable(aiError('cancelled', 'tts-test', 'x'))).toBe(false);
  });
});
