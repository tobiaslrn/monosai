import { describe, expect, it } from 'vitest';
import { describeThrown, technicalCode, unexpectedError } from './errors';

describe('errors', () => {
  it('builds a stable copyable technical code', () => {
    expect(technicalCode({ domain: 'storage', code: 'quota', message: 'x' })).toBe('storage/quota');
  });

  it('creates unexpected errors with an optional redacted cause', () => {
    expect(unexpectedError('boom')).toEqual({
      domain: 'unexpected',
      code: 'unexpected',
      message: 'boom',
    });
    expect(unexpectedError('boom', 'why').cause).toBe('why');
  });

  it('describes thrown values without leaking payloads', () => {
    expect(describeThrown(new TypeError('bad thing'))).toBe('TypeError: bad thing');
    expect(describeThrown({ secret: 'key' })).toBe('non-error thrown value of type object');
  });
});
