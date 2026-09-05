import { Injectable, inject, signal } from '@angular/core';
import {
  UNKNOWN_PERSISTENCE,
  type PersistenceStatus,
} from '../../domain/storage/persistence-status';
import type { StorageError } from '../../domain/storage/storage-error';
import { STORAGE_MAINTENANCE } from '../shared/repository-tokens';

export type StorageAction = 'idle' | 'requesting-persistence' | 'clearing-audio' | 'resetting';

/**
 * What is known about storage protection right now.
 *
 * Kept as one exhaustive state rather than derived from `persisted` alone,
 * because "not persisted" covered four different situations that need four
 * different sentences: the status was never read, the browser does not offer
 * protection, it has not been asked yet, and it was asked and said no. Asking
 * and being declined used to leave the screen character-for-character
 * unchanged, so the only available reading was that the button did nothing.
 */
export type PersistenceState =
  'unknown' | 'granted' | 'unsupported' | 'not-asked' | 'refused' | 'request-failed';

/** Storage durability status and the destructive maintenance actions. */
@Injectable({ providedIn: 'root' })
export class StorageStore {
  private readonly maintenance = inject(STORAGE_MAINTENANCE);

  private readonly statusSignal = signal<PersistenceStatus>(UNKNOWN_PERSISTENCE);
  private readonly actionSignal = signal<StorageAction>('idle');
  private readonly failureSignal = signal<StorageError | null>(null);
  private readonly audioClearedSignal = signal(false);
  private readonly persistenceSignal = signal<PersistenceState>('unknown');

  readonly status = this.statusSignal.asReadonly();
  readonly action = this.actionSignal.asReadonly();
  readonly failure = this.failureSignal.asReadonly();
  readonly audioCleared = this.audioClearedSignal.asReadonly();
  readonly persistence = this.persistenceSignal.asReadonly();

  async refresh(): Promise<void> {
    const status = await this.maintenance.getPersistenceStatus();
    if (!status.ok) {
      this.statusSignal.set(UNKNOWN_PERSISTENCE);
      this.persistenceSignal.set('unknown');
      this.failureSignal.set(status.error);
      return;
    }
    this.statusSignal.set(status.value);
    this.persistenceSignal.set(this.stateFor(status.value, this.persistenceSignal()));
  }

  /**
   * Only ever called from an explicit user action; the browser may decline.
   *
   * A decline is recorded, not swallowed: the button stays enabled because the
   * request really is retryable and a browser can grant it later, but the
   * screen has to say that it was asked and refused, or pressing it again is
   * the only sensible thing left to do.
   */
  async requestPersistence(): Promise<void> {
    this.actionSignal.set('requesting-persistence');
    const requested = await this.maintenance.requestPersistence();
    if (requested.ok) {
      this.failureSignal.set(null);
      this.statusSignal.set(requested.value);
      this.persistenceSignal.set(this.stateFor(requested.value, 'refused'));
    } else {
      this.failureSignal.set(requested.error);
      this.persistenceSignal.set('request-failed');
    }
    this.actionSignal.set('idle');
  }

  /**
   * The state a fresh status implies.
   *
   * `whenAskable` is what to say when the browser could be asked: a refusal
   * already recorded survives an unrelated refresh, and a request that came
   * back without a grant is a refusal.
   */
  private stateFor(status: PersistenceStatus, whenAskable: PersistenceState): PersistenceState {
    if (status.persisted) {
      return 'granted';
    }
    if (!status.supported) {
      return 'unsupported';
    }
    return whenAskable === 'refused' ? 'refused' : 'not-asked';
  }

  async clearAudioCache(): Promise<void> {
    this.actionSignal.set('clearing-audio');
    this.audioClearedSignal.set(false);
    const cleared = await this.maintenance.clearAudioCache();
    if (cleared.ok) {
      this.failureSignal.set(null);
      this.audioClearedSignal.set(true);
      await this.refresh();
    } else {
      this.failureSignal.set(cleared.error);
    }
    this.actionSignal.set('idle');
  }

  /** Callers must have collected two explicit confirmations before calling this. */
  async resetAllData(): Promise<boolean> {
    this.actionSignal.set('resetting');
    const reset = await this.maintenance.resetAllData();
    if (!reset.ok) {
      this.failureSignal.set(reset.error);
      this.actionSignal.set('idle');
      return false;
    }
    this.failureSignal.set(null);
    return true;
  }
}
