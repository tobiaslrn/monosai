import { Injectable, inject, signal } from '@angular/core';
import {
  UNKNOWN_PERSISTENCE,
  type PersistenceStatus,
} from '../../domain/storage/persistence-status';
import type { StorageError } from '../../domain/storage/storage-error';
import { STORAGE_MAINTENANCE } from '../shared/repository-tokens';

export type StorageAction = 'idle' | 'requesting-persistence' | 'clearing-audio' | 'resetting';

/** Storage durability status and the destructive maintenance actions. */
@Injectable({ providedIn: 'root' })
export class StorageStore {
  private readonly maintenance = inject(STORAGE_MAINTENANCE);

  private readonly statusSignal = signal<PersistenceStatus>(UNKNOWN_PERSISTENCE);
  private readonly actionSignal = signal<StorageAction>('idle');
  private readonly failureSignal = signal<StorageError | null>(null);
  private readonly audioClearedSignal = signal(false);

  readonly status = this.statusSignal.asReadonly();
  readonly action = this.actionSignal.asReadonly();
  readonly failure = this.failureSignal.asReadonly();
  readonly audioCleared = this.audioClearedSignal.asReadonly();

  async refresh(): Promise<void> {
    this.statusSignal.set(await this.maintenance.getPersistenceStatus());
  }

  /** Only ever called from an explicit user action; the browser may decline. */
  async requestPersistence(): Promise<void> {
    this.actionSignal.set('requesting-persistence');
    this.statusSignal.set(await this.maintenance.requestPersistence());
    this.actionSignal.set('idle');
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
