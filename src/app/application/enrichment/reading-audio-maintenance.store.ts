import { Injectable, inject, signal } from '@angular/core';
import type { Reading } from '../../domain/reading/reading';
import type { StorageError } from '../../domain/storage/storage-error';
import { AudioPlaybackStore } from '../audio/audio-playback.store';
import { STORAGE_MAINTENANCE } from '../shared/repository-tokens';
import { AudioJobStore } from './audio-job.store';

export type ReadingAudioMaintenanceState = 'idle' | 'clearing' | 'cleared' | 'failed';

/** Reader-scoped state for deleting only the open reading's generated audio. */
@Injectable()
export class ReadingAudioMaintenanceStore {
  private readonly maintenance = inject(STORAGE_MAINTENANCE);
  private readonly jobs = inject(AudioJobStore);
  private readonly playback = inject(AudioPlaybackStore);
  private readonly stateSignal = signal<ReadingAudioMaintenanceState>('idle');
  private readonly errorSignal = signal<StorageError | null>(null);

  readonly state = this.stateSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();

  async clear(reading: Reading): Promise<boolean> {
    if (this.stateSignal() === 'clearing') {
      return false;
    }
    this.stateSignal.set('clearing');
    this.errorSignal.set(null);
    await this.jobs.cancelAndWait();
    this.playback.readingAudioCleared(reading.id);
    const cleared = await this.maintenance.clearReadingAudio(reading.id);
    if (!cleared.ok) {
      // The rows still exist, so restore availability from storage. Playback
      // stays stopped because deletion was explicitly requested.
      await this.playback.prepare(reading);
      this.errorSignal.set(cleared.error);
      this.stateSignal.set('failed');
      return false;
    }
    this.stateSignal.set('cleared');
    return true;
  }

  acknowledge(): void {
    if (this.stateSignal() !== 'clearing') {
      this.stateSignal.set('idle');
      this.errorSignal.set(null);
    }
  }
}
