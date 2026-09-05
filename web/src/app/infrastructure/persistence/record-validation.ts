import { isDevMode } from '@angular/core';
import type { ZodType } from 'zod';
import { storageError, type StorageError } from '../../domain/storage/storage-error';
import { err, ok, type Result } from '../../domain/shared/result';

/**
 * Stored records are untrusted: a browser profile can be copied, downgraded, or
 * corrupted. Small records are validated on every read; large token arrays are
 * validated in development, where fixtures and migrations are exercised.
 */
export function parseRecord<T>(
  schema: ZodType<T>,
  value: unknown,
  table: string,
): Result<T, StorageError> {
  const parsed = schema.safeParse(value);
  if (parsed.success) {
    return ok(parsed.data);
  }
  return err(
    storageError(
      'corrupt-record',
      `A stored ${table} record is not readable.`,
      parsed.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.join('.')}: ${issue.code}`)
        .join('; '),
    ),
  );
}

export function parseRecords<T>(
  schema: ZodType<T>,
  values: readonly unknown[],
  table: string,
): Result<readonly T[], StorageError> {
  const parsed: T[] = [];
  for (const value of values) {
    const result = parseRecord(schema, value, table);
    if (!result.ok) {
      return result;
    }
    parsed.push(result.value);
  }
  return ok(parsed);
}

/** Validation for bulk analysis payloads, enabled in development only. */
export function parseBulkRecords<T>(
  schema: ZodType<T>,
  values: readonly unknown[],
  table: string,
): Result<readonly T[], StorageError> {
  if (!isDevMode()) {
    return ok(values as readonly T[]);
  }
  return parseRecords(schema, values, table);
}
