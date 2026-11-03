import { Injectable, inject } from '@angular/core';
import type { ReadingId } from '../../domain/shared/ids';
import { ClipSequencer } from './clip-sequencer';
import { PlaybackClipsStore } from './playback-clips.store';
import { PlaybackTransportStore } from './playback-transport.store';

/**
 * What playback does when stored data it depends on is deleted.
 *
 * Every entry stops before it forgets, so nothing is ever heard from a clip the
 * learner has just been told is gone. Each takes the id it is about rather than
 * assuming, so deleting a different reading never silences the one playing.
 */
@Injectable({ providedIn: 'root' })
export class PlaybackMaintenance {
  private readonly clips = inject(PlaybackClipsStore);
  private readonly transport = inject(PlaybackTransportStore);
  private readonly sequencer = inject(ClipSequencer);

  /** Stops, and forgets the reading, when the reading being read is deleted. */
  readingDeleted(readingId: ReadingId): void {
    if (this.clips.reading()?.id !== readingId) {
      return;
    }
    this.sequencer.stop();
    this.clips.forgetReading();
  }

  /**
   * Stops because every clip has just been deleted.
   *
   * Called by the settings action before it reports success, so the learner is
   * never told the cache is empty while a clip from it is still playing.
   */
  audioCacheCleared(): void {
    this.sequencer.stop();
    this.clips.forgetClips();
    this.transport.clearFailure();
  }

  /** Stops and forgets clips only when they belong to the cleared reading. */
  readingAudioCleared(readingId: ReadingId): void {
    if (this.clips.reading()?.id !== readingId) {
      return;
    }
    this.audioCacheCleared();
  }
}
