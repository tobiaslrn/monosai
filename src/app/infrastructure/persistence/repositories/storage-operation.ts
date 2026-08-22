import { err, ok, type Result } from '../../../domain/shared/result';
import type { StorageError } from '../../../domain/storage/storage-error';
import type { Logger } from '../../../application/shared/diagnostics';
import { mapStorageFailure } from '../storage-error-mapper';

let storageLogger: Logger | null = null;

/** Configures the process-local observer used by all repository operations. */
export function configureStorageLogger(logger: Logger): void {
  storageLogger = logger;
}

/**
 * Runs a storage operation and converts any thrown Dexie/IndexedDB failure
 * into a typed `StorageError`.
 */
export async function runStorage<T>(
  operation: string,
  work: () => Promise<T>,
): Promise<Result<T, StorageError>> {
  const safeOperation = safeOperationName(operation);
  storageLogger?.debug('storage.operation.started', { operation: safeOperation });
  try {
    const value = await work();
    storageLogger?.debug('storage.operation.succeeded', { operation: safeOperation });
    return ok(value);
  } catch (thrown) {
    const failure = mapStorageFailure(thrown, operation);
    storageLogger?.error('storage.operation.failed', {
      errorDomain: failure.domain,
      errorCode: failure.code,
      operation: safeOperation,
    });
    return err(failure);
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
  const safeOperation = safeOperationName(operation);
  storageLogger?.debug('storage.operation.started', { operation: safeOperation });
  try {
    const value = await work();
    storageLogger?.debug('storage.operation.succeeded', { operation: safeOperation });
    return ok(value);
  } catch (thrown) {
    if (thrown instanceof StorageRuleViolation) {
      storageLogger?.error('storage.operation.failed', {
        errorDomain: thrown.storageError.domain,
        errorCode: thrown.storageError.code,
        operation: safeOperation,
      });
      return err(thrown.storageError);
    }
    const failure = mapStorageFailure(thrown, operation);
    storageLogger?.error('storage.operation.failed', {
      errorDomain: failure.domain,
      errorCode: failure.code,
      operation: safeOperation,
    });
    return err(failure);
  }
}

function safeOperationName(operation: string): string {
  return operation.replace(/\([^)]*\)/g, '').slice(0, 120);
}
