import type { Clock } from '../../../domain/shared/clock';
import { err, ok, type Result } from '../../../domain/shared/result';
import type { CredentialRepository } from '../../../domain/settings/credential-repository';
import { NO_CREDENTIAL, type CredentialStatus } from '../../../domain/settings/credential';
import { storageError, type StorageError } from '../../../domain/storage/storage-error';
import type { MonosaiDatabase } from '../monosai-db';
import { parseRecord } from '../record-validation';
import { ROW_VERSION } from '../schemas/common.schema';
import { credentialRowSchema } from '../schemas/settings.schema';
import { runStorage } from './storage-operation';

const CREDENTIAL_KEY = 'openrouter';

/**
 * Isolated credential storage.
 *
 * The saved key is returned only to the callback passed to `useApiKey`, which
 * belongs to the OpenRouter request adapter. No method returns it, so it cannot
 * reach a component value, template, log, or serialized diagnostic.
 */
export class DexieCredentialRepository implements CredentialRepository {
  constructor(
    private readonly db: MonosaiDatabase,
    private readonly clock: Clock,
  ) {}

  async getStatus(): Promise<Result<CredentialStatus, StorageError>> {
    const row = await this.loadRow();
    if (!row.ok) {
      return row;
    }
    if (!row.value) {
      return ok(NO_CREDENTIAL);
    }
    return ok({
      isConfigured: true,
      createdAt: row.value.createdAt,
      updatedAt: row.value.updatedAt,
    });
  }

  async replace(apiKey: string): Promise<Result<CredentialStatus, StorageError>> {
    const trimmed = apiKey.trim();
    if (trimmed.length === 0) {
      return err(storageError('conflict', 'An API key cannot be empty.'));
    }

    const existing = await this.loadRow();
    if (!existing.ok) {
      return existing;
    }

    const now = this.clock.now();
    const createdAt = existing.value?.createdAt ?? now;
    const written = await runStorage('credentials.put', () =>
      this.db.credentials.put({
        key: CREDENTIAL_KEY,
        v: ROW_VERSION,
        apiKey: trimmed,
        createdAt,
        updatedAt: now,
      }),
    );
    if (!written.ok) {
      return written;
    }
    return ok({ isConfigured: true, createdAt, updatedAt: now });
  }

  async remove(): Promise<Result<CredentialStatus, StorageError>> {
    const deleted = await runStorage('credentials.delete', () =>
      this.db.credentials.delete(CREDENTIAL_KEY),
    );
    return deleted.ok ? ok(NO_CREDENTIAL) : deleted;
  }

  async useApiKey<T>(use: (apiKey: string) => Promise<T>): Promise<Result<T, StorageError>> {
    const row = await this.loadRow();
    if (!row.ok) {
      return row;
    }
    if (!row.value) {
      return err(storageError('not-found', 'No OpenRouter key is saved.'));
    }
    return ok(await use(row.value.apiKey));
  }

  private async loadRow() {
    const loaded = await runStorage('credentials.get', () =>
      this.db.credentials.get(CREDENTIAL_KEY),
    );
    if (!loaded.ok) {
      return loaded;
    }
    if (!loaded.value) {
      return ok(null);
    }
    return parseRecord(credentialRowSchema, loaded.value, 'credentials');
  }
}
