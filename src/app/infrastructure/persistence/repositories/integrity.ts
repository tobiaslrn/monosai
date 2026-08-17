import { storageError } from '../../../domain/storage/storage-error';
import { StorageRuleViolation } from './storage-operation';

/** Duplicate identities or positions abort the parent transaction. */
export function assertUniqueIds(records: readonly { readonly id: string }[], label: string): void {
  const seen = new Set<string>();
  for (const record of records) {
    if (seen.has(record.id)) {
      throw new StorageRuleViolation(
        storageError('conflict', `Duplicate ${label} identifier in one save.`),
      );
    }
    seen.add(record.id);
  }
}

export function assertUniquePositions(positions: readonly number[], label: string): void {
  const seen = new Set<number>();
  for (const position of positions) {
    if (seen.has(position)) {
      throw new StorageRuleViolation(
        storageError('conflict', `Duplicate ${label} position in one save.`),
      );
    }
    seen.add(position);
  }
}
