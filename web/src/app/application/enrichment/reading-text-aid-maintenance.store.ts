import { Injectable, inject, signal } from '@angular/core';
import type { ClearableReadingAid } from '../../domain/storage/storage-maintenance';
import type { StorageError } from '../../domain/storage/storage-error';
import { ReaderStore } from '../reading/reader.store';
import { STORAGE_MAINTENANCE } from '../shared/repository-tokens';
import { PreparationStore } from './preparation.store';

/** Reader-scoped lifecycle for clearing a saved translation or grammar review. */
@Injectable()
export class ReadingTextAidMaintenanceStore {
  private readonly maintenance = inject(STORAGE_MAINTENANCE);
  private readonly preparation = inject(PreparationStore);
  private readonly reader = inject(ReaderStore);
  private readonly pendingSignal = signal<ClearableReadingAid | null>(null);
  private readonly errorSignal = signal<StorageError | null>(null);

  readonly pending = this.pendingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();

  async clear(layer: ClearableReadingAid): Promise<boolean> {
    const reading = this.reader.reading();
    if (reading === null || this.pendingSignal() !== null) return false;
    this.pendingSignal.set(layer);
    this.errorSignal.set(null);
    try {
      const stopped = await this.preparation.stopLayer(reading.id, layer);
      if (!stopped.ok) {
        this.errorSignal.set(stopped.error);
        return false;
      }
      const cleared = await this.maintenance.clearReadingAid(reading.id, layer);
      if (!cleared.ok) {
        this.errorSignal.set(cleared.error);
        return false;
      }
      await this.reader.refreshSummaries();
      return true;
    } finally {
      this.pendingSignal.set(null);
    }
  }

  acknowledge(): void {
    this.errorSignal.set(null);
  }
}
