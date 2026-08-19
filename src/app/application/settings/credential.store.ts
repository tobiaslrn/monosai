import { Injectable, computed, inject, signal } from '@angular/core';
import { NO_CREDENTIAL, type CredentialStatus } from '../../domain/settings/credential';
import type { StorageError } from '../../domain/storage/storage-error';
import { CREDENTIAL_REPOSITORY } from '../shared/repository-tokens';

export type CredentialAction = 'idle' | 'saving' | 'removing';

/**
 * The saved OpenRouter key, as far as anything above the request adapter is
 * allowed to know it.
 *
 * The key is never held in a signal, a field, or a form model: it is passed
 * straight from the input event to the repository and forgotten. What remains
 * is whether one is configured and when it changed — which is also what the
 * configuration fingerprints depend on.
 */
@Injectable({ providedIn: 'root' })
export class CredentialStore {
  private readonly repository = inject(CREDENTIAL_REPOSITORY);

  private readonly statusSignal = signal<CredentialStatus>(NO_CREDENTIAL);
  private readonly actionSignal = signal<CredentialAction>('idle');
  private readonly failureSignal = signal<StorageError | null>(null);

  readonly status = this.statusSignal.asReadonly();
  readonly action = this.actionSignal.asReadonly();
  readonly failure = this.failureSignal.asReadonly();

  readonly isConfigured = computed(() => this.statusSignal().isConfigured);

  /**
   * Generation counter standing in for the key inside fingerprints.
   *
   * It moves whenever the key is saved, replaced, or removed, so a stored test
   * result goes stale exactly when the credential it was made with changes.
   */
  readonly keyGeneration = computed(() => this.statusSignal().updatedAt ?? -1);

  async load(): Promise<void> {
    const status = await this.repository.getStatus();
    if (status.ok) {
      this.statusSignal.set(status.value);
      this.failureSignal.set(null);
    } else {
      this.failureSignal.set(status.error);
    }
  }

  /** Saves or replaces the key. The value is not retained anywhere else. */
  async save(apiKey: string): Promise<boolean> {
    this.actionSignal.set('saving');
    const saved = await this.repository.replace(apiKey);
    this.actionSignal.set('idle');

    if (!saved.ok) {
      this.failureSignal.set(saved.error);
      return false;
    }
    this.statusSignal.set(saved.value);
    this.failureSignal.set(null);
    return true;
  }

  /**
   * Removes the key.
   *
   * Configuration tests become meaningless and read as not configured, but
   * readings, snapshots, and cached aids are untouched: nothing the learner
   * already has depends on the key still being there.
   */
  async remove(): Promise<boolean> {
    this.actionSignal.set('removing');
    const removed = await this.repository.remove();
    this.actionSignal.set('idle');

    if (!removed.ok) {
      this.failureSignal.set(removed.error);
      return false;
    }
    this.statusSignal.set(removed.value);
    this.failureSignal.set(null);
    return true;
  }
}
