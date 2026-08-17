import type { Result } from '../shared/result';
import type { StorageError } from '../storage/storage-error';
import type { CredentialStatus } from './credential';

/**
 * The saved OpenRouter key never reaches a component, log, or diagnostic.
 * Only the request adapter may call `useApiKey`, and only inside the callback
 * that builds an outbound request.
 */
export interface CredentialRepository {
  getStatus(): Promise<Result<CredentialStatus, StorageError>>;
  replace(apiKey: string): Promise<Result<CredentialStatus, StorageError>>;
  remove(): Promise<Result<CredentialStatus, StorageError>>;
  useApiKey<T>(use: (apiKey: string) => Promise<T>): Promise<Result<T, StorageError>>;
}
