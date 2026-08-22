import { storageError, type StorageError } from '../../domain/storage/storage-error';
import { describeThrown } from '../../domain/shared/errors';

/**
 * Translates Dexie/IndexedDB failures into `StorageError` variants. Raw Dexie
 * errors never escape infrastructure.
 */
export function mapStorageFailure(thrown: unknown, operation: string): StorageError {
  const name = errorName(thrown);
  const cause = `${operation}: ${describeThrown(thrown)}`;

  switch (name) {
    case 'QuotaExceededError':
    case 'QuotaExceeded':
      return storageError('quota', 'Browser storage is full.', cause);
    case 'AbortError':
    case 'TransactionInactiveError':
      return storageError(
        'transaction-aborted',
        'The storage transaction did not complete.',
        cause,
      );
    case 'DatabaseClosedError':
    case 'InvalidStateError':
    case 'UnknownError':
      return storageError('unavailable', 'Browser storage is unavailable.', cause);
    case 'VersionError':
    case 'UpgradeError':
    case 'InvalidTableError':
    case 'SchemaError':
    case 'NotFoundError':
      return storageError('migration-failed', 'The stored database could not be upgraded.', cause);
    case 'ConstraintError':
      return storageError('conflict', 'A record with the same identity already exists.', cause);
    case 'DataError':
    case 'DataCloneError':
      return storageError('corrupt-record', 'A stored record could not be read.', cause);
    case 'BlockedError':
      return storageError('blocked', 'Another Monosai tab is blocking a database upgrade.', cause);
    default:
      return storageError('unknown', 'An unexpected storage error occurred.', cause);
  }
}

function errorName(thrown: unknown): string {
  if (thrown instanceof Error) {
    return thrown.name;
  }
  return 'Unknown';
}
