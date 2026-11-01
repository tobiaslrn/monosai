import type { DomainErrorBase } from '../shared/errors';

export type StorageErrorCode =
  | 'quota'
  | 'blocked'
  | 'corrupt-record'
  | 'transaction-aborted'
  | 'unavailable'
  | 'migration-failed'
  | 'newer-version'
  | 'not-found'
  | 'conflict'
  | 'unknown';

export type StorageError = DomainErrorBase<'storage', StorageErrorCode>;

export function storageError(
  code: StorageErrorCode,
  message: string,
  cause?: string,
): StorageError {
  return { domain: 'storage', code, message, ...(cause === undefined ? {} : { cause }) };
}

const RECOVERABLE_BY_RETRY: readonly StorageErrorCode[] = [
  'blocked',
  'transaction-aborted',
  'unavailable',
  'unknown',
];

export function isRetryable(error: StorageError): boolean {
  return RECOVERABLE_BY_RETRY.includes(error.code);
}

const RECOVERABLE_BY_RESET: readonly StorageErrorCode[] = [
  'migration-failed',
  'corrupt-record',
  'newer-version',
];

/**
 * Whether the stored data itself is the problem, so deleting it can get past the failure.
 * For a database from a newer build, reloading into that build is the better remedy; the
 * reset is only the explicit last resort for staying on this one.
 */
export function resetMayRecover(error: StorageError): boolean {
  return RECOVERABLE_BY_RESET.includes(error.code);
}

/** Why a tab's connection to the database ended without the tab closing it. */
export type DatabaseLossCause = 'another-tab' | 'connection-closed';

/** Carries a typed storage failure through a code path that reports by throwing. */
export class StorageFailure extends Error {
  constructor(readonly storageError: StorageError) {
    super(storageError.message);
    this.name = 'StorageFailure';
  }
}
