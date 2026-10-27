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
  let parsed = schema.safeParse(value);
  if (!parsed.success) {
    // Only a row that fails is walked for `undefined` properties, so the read
    // path of a valid row costs one parse and no copy.
    const normalized = withoutUndefinedProperties(value);
    if (normalized !== value) {
      parsed = schema.safeParse(normalized);
    }
  }
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

/**
 * Drops properties whose value is `undefined`, at any depth of plain objects
 * and arrays.
 *
 * Record schemas treat an optional property as present with a value or absent,
 * as the domain types do. IndexedDB keeps a property set to `undefined`, and
 * rows written before that distinction was enforced can carry one, so it reads
 * as absent — exactly as it did — instead of failing the read. `parseRecord`
 * applies it only to a row that failed as stored. A value with nothing to drop
 * is returned as it is rather than copied.
 */
export function withoutUndefinedProperties(value: unknown): unknown {
  if (Array.isArray(value)) {
    const entries: readonly unknown[] = value;
    let copy: unknown[] | null = null;
    for (const [index, entry] of entries.entries()) {
      const normalized = withoutUndefinedProperties(entry);
      if (normalized !== entry) {
        copy ??= [...entries];
        copy[index] = normalized;
      }
    }
    return copy ?? value;
  }
  if (!isPlainObject(value)) {
    return value;
  }
  let changed = false;
  const kept: [string, unknown][] = [];
  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined) {
      changed = true;
      continue;
    }
    const normalized = withoutUndefinedProperties(entry);
    changed ||= normalized !== entry;
    kept.push([key, normalized]);
  }
  return changed ? Object.fromEntries(kept) : value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
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
