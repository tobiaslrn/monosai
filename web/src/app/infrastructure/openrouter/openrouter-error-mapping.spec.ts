import { describe, expect, it } from 'vitest';
import type { AiErrorCode } from '../../domain/ai/ai-error';
import { ALL_AI_TASKS } from '../../domain/ai/ai-task';
import { capabilityFrom, mapHttpStatus, parseRetryAfterMs } from './openrouter-error-mapping';
import type { ProviderErrorEnvelope } from './openrouter-response.schema';

const context = { task: 'text-model-test', modelId: 'vendor/model' } as const;

function envelope(message: string, param?: string): ProviderErrorEnvelope {
  return { error: { message, ...(param === undefined ? {} : { param }) } };
}

function codeFor(status: number, body: ProviderErrorEnvelope | null = null): AiErrorCode {
  return mapHttpStatus(status, context, body, undefined, 'cid').code;
}

describe('mapHttpStatus', () => {
  it('maps each status class to its own recovery lane', () => {
    expect(codeFor(401)).toBe('authentication');
    expect(codeFor(403)).toBe('authentication');
    expect(codeFor(402)).toBe('credit-exhausted');
    expect(codeFor(404)).toBe('model-not-found');
    expect(codeFor(413)).toBe('context-budget-exceeded');
    expect(codeFor(429)).toBe('rate-limited');
    expect(codeFor(500)).toBe('provider-unavailable');
    expect(codeFor(503)).toBe('provider-unavailable');
  });

  /**
   * Every status the provider can answer with, against every task that can
   * provoke one. The classification is a property of the status alone: a 402
   * during a settings test and a 402 mid-sentence are the same failure, and the
   * copy tables are what make the two read differently.
   */
  const STATUS_LANES: readonly { readonly status: number; readonly code: AiErrorCode }[] = [
    { status: 401, code: 'authentication' },
    { status: 402, code: 'credit-exhausted' },
    { status: 403, code: 'authentication' },
    { status: 404, code: 'model-not-found' },
    { status: 413, code: 'context-budget-exceeded' },
    { status: 429, code: 'rate-limited' },
    { status: 500, code: 'provider-unavailable' },
    { status: 502, code: 'provider-unavailable' },
    { status: 503, code: 'provider-unavailable' },
    { status: 302, code: 'unknown' },
  ];

  it.each(STATUS_LANES)('maps HTTP $status the same way for every task', ({ status, code }) => {
    for (const task of ALL_AI_TASKS) {
      const error = mapHttpStatus(
        status,
        { task, modelId: 'vendor/model' },
        null,
        undefined,
        'cid',
      );

      expect(error.code, `${String(status)} during ${task}`).toBe(code);
      expect(error.task).toBe(task);
      expect(error.detail?.status).toBe(status);
    }
  });

  it('separates an empty balance from a rejected key', () => {
    expect(codeFor(402)).not.toBe(codeFor(401));
  });

  it('reads a missing model out of a 400 that names one', () => {
    expect(codeFor(400, envelope('No endpoints found for the requested model'))).toBe(
      'model-not-found',
    );
  });

  it('treats any other 4xx as a capability the model lacks', () => {
    const error = mapHttpStatus(
      400,
      context,
      envelope('This model does not support the response_format parameter', 'response_format'),
      undefined,
      'cid',
    );

    expect(error.code).toBe('capability-unsupported');
    expect(error.detail?.capability).toBe('structured-output');
  });

  it('falls back to unknown with a correlation id for an unclassifiable status', () => {
    const error = mapHttpStatus(302, context, null, undefined, 'cid-7');

    expect(error.code).toBe('unknown');
    expect(error.detail?.correlationId).toBe('cid-7');
  });

  it('carries the requested model so the copy can name it', () => {
    expect(mapHttpStatus(404, context, null, undefined, 'cid').detail?.modelId).toBe(
      'vendor/model',
    );
  });

  it('records a rate-limit wait when the provider gives one', () => {
    expect(mapHttpStatus(429, context, null, 2_000, 'cid').detail?.retryAfterMs).toBe(2_000);
  });

  it('never copies provider wording into the error', () => {
    const error = mapHttpStatus(
      400,
      context,
      envelope('Your prompt about the secret castle was rejected'),
      undefined,
      'cid',
    );

    expect(JSON.stringify(error)).not.toContain('castle');
  });
});

describe('capabilityFrom', () => {
  it('names the refused parameter', () => {
    expect(capabilityFrom(envelope('unsupported', 'speed'))).toBe('speed');
    expect(capabilityFrom(envelope('Unknown voice for this model'))).toBe('voice');
    expect(capabilityFrom(envelope('json_schema is not supported'))).toBe('structured-output');
  });

  it('falls back to the request itself when nothing is recognizable', () => {
    expect(capabilityFrom(envelope('something went wrong'))).toBe('request');
    expect(capabilityFrom(null)).toBe('request');
  });
});

describe('parseRetryAfterMs', () => {
  const now = Date.parse('2026-01-01T00:00:00Z');

  it('reads a delay in seconds', () => {
    expect(parseRetryAfterMs('3', now)).toBe(3_000);
  });

  it('reads an HTTP date as a wait from now', () => {
    expect(parseRetryAfterMs('Thu, 01 Jan 2026 00:00:30 GMT', now)).toBe(30_000);
  });

  it('never returns a negative wait for a date in the past', () => {
    expect(parseRetryAfterMs('Thu, 01 Jan 2020 00:00:00 GMT', now)).toBe(0);
  });

  it('returns undefined rather than guessing', () => {
    expect(parseRetryAfterMs(null, now)).toBeUndefined();
    expect(parseRetryAfterMs('  ', now)).toBeUndefined();
    expect(parseRetryAfterMs('soon', now)).toBeUndefined();
  });
});
