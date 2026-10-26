import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Reading } from '../../domain/reading/reading';
import { DEFAULT_READER_PREFERENCES, type ReaderPreferences } from '../../domain/settings/settings';
import { sentenceId, type SentenceId } from '../../domain/shared/ids';
import { AppSettingsStore } from '../settings/app-settings.store';
import { MEDIA_SESSION, NO_MEDIA_SESSION, type MediaSessionMetadata } from './media-session';
import { PlaybackClipsStore } from './playback-clips.store';
import { PlaybackTransportStore } from './playback-transport.store';

const SENTENCES: readonly SentenceId[] = [0, 1, 2].map((index) =>
  sentenceId(`00000000-0000-4000-8000-00000000000${String(index)}`),
);

describe('PlaybackTransportStore', () => {
  let transport: PlaybackTransportStore;
  let reading: WritableSignal<Reading | null>;
  let preferences: WritableSignal<ReaderPreferences>;
  let states: string[];
  let metadata: MediaSessionMetadata[];
  let clears: number;
  let setReaderPreference: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    TestBed.resetTestingModule();
    reading = signal<Reading | null>(null);
    preferences = signal<ReaderPreferences>(DEFAULT_READER_PREFERENCES);
    states = [];
    metadata = [];
    clears = 0;
    setReaderPreference = vi.fn(() => Promise.resolve());
    const refs = signal(SENTENCES.map((id) => ({ id })));
    TestBed.configureTestingModule({
      providers: [
        {
          provide: PlaybackClipsStore,
          useValue: {
            reading,
            refs,
            positionOf: (id: SentenceId) => refs().findIndex((ref) => ref.id === id) + 1,
          },
        },
        {
          provide: MEDIA_SESSION,
          useValue: {
            ...NO_MEDIA_SESSION,
            setPlaybackState: (state: string) => states.push(state),
            setMetadata: (entry: MediaSessionMetadata) => metadata.push(entry),
            clear: () => {
              clears += 1;
            },
          },
        },
        {
          provide: AppSettingsStore,
          useValue: { readerPreferences: preferences.asReadonly(), setReaderPreference },
        },
      ],
    });
    transport = TestBed.inject(PlaybackTransportStore);
  });

  it('starts idle, with no cursor and nothing waited for', () => {
    expect(transport.status()).toBe('idle');
    expect(transport.isActive()).toBe(false);
    expect(transport.currentPosition()).toBe(0);
    expect(transport.pendingPosition()).toBe(0);
    expect(transport.mode()).toBe('continuous');
    expect(transport.stepMode()).toBe(false);
  });

  /** The lock screen can never disagree with the player card. */
  it('tells the media session every status except loading', () => {
    transport.enter('loading');
    transport.enter('playing');
    transport.enter('paused');
    transport.enter('stepped');
    transport.enter('waiting');
    transport.enter('ended');

    expect(states).toEqual(['playing', 'paused', 'paused', 'paused', 'paused']);
    expect(transport.status()).toBe('ended');
  });

  it('positions the cursor and the wait by sentence, one-based', () => {
    transport.moveTo(SENTENCES[1]);
    transport.waitFor(SENTENCES[2]);

    expect(transport.currentPosition()).toBe(2);
    expect(transport.pendingPosition()).toBe(3);
    expect(transport.status()).toBe('waiting');
    expect(states).toEqual(['paused']);

    transport.stopWaiting();

    expect(transport.pendingSentenceId()).toBeNull();
    expect(transport.pendingPosition()).toBe(0);
  });

  it('resets to an empty lock screen', () => {
    transport.single = true;
    transport.moveTo(SENTENCES[0]);
    transport.waitFor(SENTENCES[1]);

    transport.reset();

    expect(transport.status()).toBe('idle');
    expect(transport.currentSentenceId()).toBeNull();
    expect(transport.pendingSentenceId()).toBeNull();
    expect(transport.single).toBe(false);
    expect(states.at(-1)).toBe('none');
    expect(clears).toBe(1);
  });

  it('counts each navigation it is told about', () => {
    transport.countNavigation();
    transport.countNavigation();

    expect(transport.explicitNavigation()).toBe(2);
  });

  it('holds a failure until it is cleared', () => {
    transport.fail({ kind: 'missing-clip', position: 2 });
    expect(transport.failure()).toEqual({ kind: 'missing-clip', position: 2 });

    transport.clearFailure();
    expect(transport.failure()).toBeNull();
  });

  it('names the step posture for what it does at a seam', () => {
    transport.changeMode('sentence');

    expect(transport.mode()).toBe('sentence');
    expect(transport.stepMode()).toBe(true);
  });

  it('reads the saved rate, and plays at 1× when the saved value is not a rate', () => {
    preferences.set({ ...DEFAULT_READER_PREFERENCES, playbackRate: 0.8 });
    expect(transport.playbackRate()).toBe(0.8);

    preferences.set({ ...DEFAULT_READER_PREFERENCES, playbackRate: 7 as never });
    expect(transport.playbackRate()).toBe(1);

    transport.saveRate(0.9);
    expect(setReaderPreference).toHaveBeenCalledWith('playbackRate', 0.9);
  });

  describe('lock-screen metadata', () => {
    it('names the reading and the sentence', () => {
      reading.set({ title: '  桃太郎  ' } as Reading);

      transport.publishMetadata(1);

      expect(metadata.at(-1)).toEqual({
        title: '桃太郎',
        artist: 'Monosai',
        album: 'Sentence 2 of 3',
      });
    });

    it('falls back to a generic title for an untitled reading', () => {
      transport.publishMetadata(0);

      expect(metadata.at(-1)?.title).toBe('Japanese story');
    });

    /**
     * An import saved without a title has its body text as its title, so
     * publishing it whole put a wall of Japanese on the notification.
     */
    it('shortens a title that is really the body text', () => {
      reading.set({ title: 'あ'.repeat(200) } as Reading);

      transport.publishMetadata(0);

      expect(metadata.at(-1)?.title).toBe(`${'あ'.repeat(59)}…`);
    });
  });
});
