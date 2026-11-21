import { Injectable, inject, signal } from '@angular/core';
import type { ClearableReadingAid } from '../../domain/storage/storage-maintenance';
import { ok } from '../../domain/shared/result';
import type { StorageError } from '../../domain/storage/storage-error';
import { ReaderStore } from '../reading/reader.store';
import { STORAGE_MAINTENANCE } from '../shared/repository-tokens';
import { GrammarJobStore } from './grammar-job.store';
import { PreparationStore } from './preparation.store';

/** Reader-scoped lifecycle for clearing a saved translation or grammar review. */
@Injectable()
export class ReadingTextAidMaintenanceStore {
  private readonly maintenance = inject(STORAGE_MAINTENANCE);
  private readonly preparation = inject(PreparationStore);
  private readonly grammar = inject(GrammarJobStore);
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
      // Grammar is counted again by these keys, because an analysis another
      // reading with the same sentence uses stays and still shows here.
      const keys = layer === 'grammar' ? await this.grammar.currentCacheKeys(reading.id) : ok(null);
      const cleared = keys.ok
        ? await this.maintenance.clearReadingAid(reading.id, layer, keys.value)
        : keys;
      if (!cleared.ok) {
        this.errorSignal.set(cleared.error);
        return false;
      }
      this.preparation.acknowledge(reading.id, layer);
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
