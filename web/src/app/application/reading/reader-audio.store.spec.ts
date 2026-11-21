import { ApplicationRef, signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Reading } from '../../domain/reading/reading';
import { readingId } from '../../domain/shared/ids';
import { NETWORK_STATUS } from '../../domain/platform/network-status.port';
import { AudioPlaybackStore } from '../audio/audio-playback.store';
import { AudioConfigurationService } from '../enrichment/audio-configuration.service';
import { AudioJobStore } from '../enrichment/audio-job.store';
import { PreparationStore } from '../enrichment/preparation.store';
import { ReadingAudioMaintenanceStore } from '../enrichment/reading-audio-maintenance.store';
import { TtsStore } from '../settings/tts.store';
import { ReaderAudioStore } from './reader-audio.store';
import { ReaderStore } from './reader.store';

const ID = readingId('r1');
const row = (): Reading => ({ id: ID }) as unknown as Reading;

describe('ReaderAudioStore', () => {
  let reading: WritableSignal<Reading | null>;
  let progress: WritableSignal<{ kind: string; step?: number }>;
  let voice: WritableSignal<{ modelId: string; voiceId: string }>;
  let status: WritableSignal<string>;
  let prepare: ReturnType<typeof vi.fn>;
  let stopExpectingClips: ReturnType<typeof vi.fn>;
  let startLayer: ReturnType<typeof vi.fn>;
  let laneProgress: WritableSignal<{ kind: string; readingId?: string }>;
  let online: WritableSignal<boolean>;
  let acknowledgeMaintenance: ReturnType<typeof vi.fn>;
  let availableCount: WritableSignal<number>;

  const settled = () => TestBed.inject(ApplicationRef).whenStable();

  beforeEach(() => {
    reading = signal(null);
    progress = signal({ kind: 'idle' });
    voice = signal({ modelId: 'm', voiceId: 'v' });
    status = signal('idle');
    prepare = vi.fn(() => Promise.resolve());
    stopExpectingClips = vi.fn();
    startLayer = vi.fn(() => Promise.resolve());
    laneProgress = signal({ kind: 'idle' });
    online = signal(true);
    acknowledgeMaintenance = vi.fn();
    availableCount = signal(0);

    TestBed.configureTestingModule({
      providers: [
        ReaderAudioStore,
        { provide: ReaderStore, useValue: { reading } },
        {
          provide: AudioJobStore,
          useValue: { idleProgress: { kind: 'idle' }, progressFor: () => progress() },
        },
        {
          provide: PreparationStore,
          useValue: { startLayer, progressFor: () => laneProgress() },
        },
        { provide: NETWORK_STATUS, useValue: { isOnline: online } },
        {
          provide: ReadingAudioMaintenanceStore,
          useValue: { acknowledge: acknowledgeMaintenance },
        },
        { provide: AudioConfigurationService, useValue: {} },
        {
          provide: AudioPlaybackStore,
          useValue: { prepare, stopExpectingClips, status, availableCount },
        },
        { provide: TtsStore, useValue: { settings: voice } },
      ],
    });
    TestBed.inject(ReaderAudioStore).setReading(ID);
  });

  describe('preparing playback', () => {
    it('waits for a reading', async () => {
      await settled();

      expect(prepare).not.toHaveBeenCalled();
    });

    it('prepares the reading once it arrives', async () => {
      const opened = row();
      reading.set(opened);
      await settled();

      expect(prepare).toHaveBeenCalledExactlyOnceWith(opened);
    });

    it('prepares again when the job writes more and when the voice changes', async () => {
      reading.set(row());
      await settled();

      progress.set({ kind: 'running', step: 1 });
      await settled();
      expect(prepare).toHaveBeenCalledTimes(2);

      voice.set({ modelId: 'm', voiceId: 'other' });
      await settled();
      expect(prepare).toHaveBeenCalledTimes(3);
    });
  });

  describe('asking for audio', () => {
    // The lane claims the reading before anything is synthesized, so a second
    // tab can never read the same sentences aloud at the same time.
    it.each(['start', 'retry'] as const)('asks the preparation lane on %s', (action) => {
      TestBed.inject(ReaderAudioStore)[action]();

      expect(acknowledgeMaintenance).toHaveBeenCalledOnce();
      expect(startLayer).toHaveBeenCalledExactlyOnceWith(ID, 'audio');
    });
  });

  describe('what the player is told', () => {
    // The lane's word for a request that has not had its turn, which is what
    // Story options says about the same run: the player must not go on
    // offering Generate audio after it was pressed.
    it('reports a request still waiting for the lane as in progress', () => {
      const store = TestBed.inject(ReaderAudioStore);
      laneProgress.set({ kind: 'queued', readingId: ID });

      expect(store.progress()).toEqual({ kind: 'queued', readingId: ID });
      expect(store.running()).toBe(true);
      expect(store.buttonLabel()).toBe('Audio, being generated');
    });

    it("reports the run's own progress once it has started", () => {
      const store = TestBed.inject(ReaderAudioStore);
      progress.set({ kind: 'running' });
      laneProgress.set({ kind: 'running' });

      expect(store.progress()).toEqual({ kind: 'running' });
    });

    it('says whether the connection is there', () => {
      const store = TestBed.inject(ReaderAudioStore);
      online.set(false);

      expect(store.online()).toBe(false);
    });
  });

  describe('whether there is audio to delete', () => {
    const withSaved = (completed: number): Reading =>
      ({ id: ID, audioSummary: { completed } }) as unknown as Reading;

    // A request that has produced nothing would be "deleted" by cancelling it,
    // which is the player's Stop, not a deletion.
    it('has none while a request waits with no clip saved', () => {
      const store = TestBed.inject(ReaderAudioStore);
      reading.set(withSaved(0));
      laneProgress.set({ kind: 'queued', readingId: ID });

      expect(store.running()).toBe(true);
      expect(store.hasSavedAudio()).toBe(false);
    });

    it('has the clips a parked run already saved', () => {
      const store = TestBed.inject(ReaderAudioStore);
      reading.set(withSaved(0));
      progress.set({ kind: 'paused' });
      availableCount.set(2);

      expect(store.hasSavedAudio()).toBe(true);
    });

    it('has the clips the reading opened with', () => {
      const store = TestBed.inject(ReaderAudioStore);
      reading.set(withSaved(3));

      expect(store.hasSavedAudio()).toBe(true);
    });
  });

  describe('releasing a wait', () => {
    it.each(['failed', 'cancelled'])('says no clips are coming after a %s run', async (kind) => {
      progress.set({ kind });
      await settled();

      expect(stopExpectingClips).toHaveBeenCalled();
    });

    it('says nothing while a run is still going', async () => {
      progress.set({ kind: 'running' });
      status.set('waiting');
      await settled();

      expect(stopExpectingClips).not.toHaveBeenCalled();
    });

    it('releases a wait that starts after the run has stopped', async () => {
      progress.set({ kind: 'failed' });
      await settled();
      stopExpectingClips.mockClear();

      status.set('waiting');
      await settled();

      expect(stopExpectingClips).toHaveBeenCalledOnce();
    });
  });
});
