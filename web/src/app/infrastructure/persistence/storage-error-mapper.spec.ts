import { describe, expect, it } from 'vitest';
import { isRetryable } from '../../domain/storage/storage-error';
import { mapStorageFailure } from './storage-error-mapper';

function named(name: string, message = 'boom'): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

describe('mapStorageFailure', () => {
  it('maps every documented storage failure to its own variant', () => {
    expect(mapStorageFailure(named('QuotaExceededError'), 'op').code).toBe('quota');
    expect(mapStorageFailure(named('AbortError'), 'op').code).toBe('transaction-aborted');
    expect(mapStorageFailure(named('TransactionInactiveError'), 'op').code).toBe(
      'transaction-aborted',
    );
    expect(mapStorageFailure(named('DatabaseClosedError'), 'op').code).toBe('unavailable');
    expect(mapStorageFailure(named('VersionError'), 'op').code).toBe('migration-failed');
    expect(mapStorageFailure(named('InvalidTableError'), 'op').code).toBe('migration-failed');
    expect(mapStorageFailure(named('SchemaError'), 'op').code).toBe('migration-failed');
    expect(mapStorageFailure(named('NotFoundError'), 'op').code).toBe('migration-failed');
    expect(mapStorageFailure(named('ConstraintError'), 'op').code).toBe('conflict');
    expect(mapStorageFailure(named('DataError'), 'op').code).toBe('corrupt-record');
    expect(mapStorageFailure(named('BlockedError'), 'op').code).toBe('blocked');
    expect(mapStorageFailure(named('SomethingElse'), 'op').code).toBe('unknown');
  });

  it('keeps the operation and a redacted cause for diagnostics', () => {
    const mapped = mapStorageFailure(named('QuotaExceededError', 'disk full'), 'readings.save');

    expect(mapped.domain).toBe('storage');
    expect(mapped.cause).toBe('readings.save: QuotaExceededError: disk full');
    expect(mapped.message).not.toContain('disk full');
  });

  it('describes non-error throws without leaking their payload', () => {
    const mapped = mapStorageFailure({ apiKey: 'sk-secret' }, 'credentials.get');

    expect(mapped.code).toBe('unknown');
    expect(JSON.stringify(mapped)).not.toContain('sk-secret');
  });

  it('classifies which failures are worth retrying', () => {
    expect(isRetryable(mapStorageFailure(named('AbortError'), 'op'))).toBe(true);
    expect(isRetryable(mapStorageFailure(named('BlockedError'), 'op'))).toBe(true);
    expect(isRetryable(mapStorageFailure(named('QuotaExceededError'), 'op'))).toBe(false);
    expect(isRetryable(mapStorageFailure(named('ConstraintError'), 'op'))).toBe(false);
  });
});
