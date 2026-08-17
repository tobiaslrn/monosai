import { err, ok, type Result } from '../../../domain/shared/result';
import type { StorageError } from '../../../domain/storage/storage-error';
import { mapStorageFailure } from '../storage-error-mapper';

/**
 * Runs a storage operation and converts any thrown Dexie/IndexedDB failure
 * into a typed `StorageError`.
 */
export async function runStorage<T>(
  operation: string,
  work: () => Promise<T>,
): Promise<Result<T, StorageError>> {
  try {
    return ok(await work());
  } catch (thrown) {
    return err(mapStorageFailure(thrown, operation));
  }
}

/** Signals a validation failure from inside a Dexie transaction callback. */
export class StorageRuleViolation extends Error {
  constructor(readonly storageError: StorageError) {
    super(storageError.message);
    this.name = 'StorageRuleViolation';
  }
}

export async function runStorageWithRules<T>(
  operation: string,
  work: () => Promise<T>,
): Promise<Result<T, StorageError>> {
  try {
    return ok(await work());
  } catch (thrown) {
    if (thrown instanceof StorageRuleViolation) {
      return err(thrown.storageError);
    }
    return err(mapStorageFailure(thrown, operation));
  }
}
