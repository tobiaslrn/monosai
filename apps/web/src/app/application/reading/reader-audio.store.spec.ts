import { ApplicationRef, signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Reading } from '../../domain/reading/reading';
import { readingId } from '../../domain/shared/ids';
import { AudioPlaybackStore } from '../audio/audio-playback.store';
import { AudioConfigurationService } from '../enrichment/audio-configuration.service';
import { AudioJobStore } from '../enrichment/audio-job.store';
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

  const settled = () => TestBed.inject(ApplicationRef).whenStable();

  beforeEach(() => {
    reading = signal(null);
    progress = signal({ kind: 'idle' });
    voice = signal({ modelId: 'm', voiceId: 'v' });
    status = signal('idle');
    prepare = vi.fn(() => Promise.resolve());
    stopExpectingClips = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        ReaderAudioStore,
        { provide: ReaderStore, useValue: { reading } },
        {
          provide: AudioJobStore,
          useValue: { idleProgress: { kind: 'idle' }, progressFor: () => progress() },
        },
        { provide: ReadingAudioMaintenanceStore, useValue: {} },
        { provide: AudioConfigurationService, useValue: {} },
        { provide: AudioPlaybackStore, useValue: { prepare, stopExpectingClips, status } },
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
