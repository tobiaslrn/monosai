import type { DomainErrorBase } from '../shared/errors';

export type StorageErrorCode =
  | 'quota'
  | 'blocked'
  | 'corrupt-record'
  | 'transaction-aborted'
  | 'unavailable'
  | 'migration-failed'
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
