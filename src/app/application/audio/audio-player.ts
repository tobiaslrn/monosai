import { DOCUMENT, InjectionToken, inject } from '@angular/core';

/**
 * The one sound-producing object in the reader.
 *
 * An interface rather than a bare `HTMLAudioElement` for two reasons. It keeps
 * the object-URL lifecycle — create on load, revoke on every advance and on
 * stop — in one place that cannot be half-implemented by a caller, and it lets
 * `AudioPlaybackStore` be tested without a browser audio stack, which is what
 * makes "nothing plays without an explicit call" a unit-testable claim rather
 * than a manual one.
 *
 * Exactly one instance exists for the whole application. The settings TTS
 * section builds its own element for the verified test sample; that one is
 * deliberately separate, because it plays a clip that was never stored and has
 * no sentence to be the current one.
 */
export interface AudioPlayer {
  /** Loads a clip and starts it. Revokes whatever URL was loaded before. */
  play(clip: Blob): Promise<void>;
  pause(): void;
  resume(): Promise<void>;
  /** Stops, unloads, and revokes the current object URL. */
  stop(): void;
  /**
   * How far into the loaded clip playback has reached, in seconds.
   *
   * Read by Previous, which means "again" near the start of a sentence and
   * "the one before" at the start of it.
   */
  elapsed(): number;
  /** Plays the loaded clip again from its start, without reloading it. */
  restart(): Promise<void>;
  /** Called when the loaded clip finishes on its own. */
  onEnded(handler: () => void): void;
  /** Called when the loaded clip cannot be decoded or played. */
  onError(handler: () => void): void;
}

/**
 * Browser-backed player.
 *
 * `preload` is left at the element default and no source is attached until a
 * clip is actually requested, so constructing this never touches the network or
 * the disk and never makes a sound.
 */
export function createAudioPlayer(view: Window & typeof globalThis): AudioPlayer {
  const element = new view.Audio();
  let objectUrl: string | null = null;

  const release = (): void => {
    if (objectUrl !== null) {
      view.URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
  };

  return {
    async play(clip: Blob): Promise<void> {
      release();
      objectUrl = view.URL.createObjectURL(clip);
      element.src = objectUrl;
      await element.play();
    },
    pause(): void {
      element.pause();
    },
    resume(): Promise<void> {
      return element.play();
    },
    elapsed(): number {
      return element.currentTime;
    },
    async restart(): Promise<void> {
      element.currentTime = 0;
      await element.play();
    },
    stop(): void {
      element.pause();
      element.removeAttribute('src');
      element.load();
      release();
    },
    onEnded(handler: () => void): void {
      element.addEventListener('ended', handler);
    },
    onError(handler: () => void): void {
      element.addEventListener('error', handler);
    },
  };
}

/** Resolves to the single browser player, or a fake in tests. */
export const AUDIO_PLAYER = new InjectionToken<AudioPlayer>('monosai.audio-player', {
  providedIn: 'root',
  factory: () => createAudioPlayer(inject(DOCUMENT).defaultView ?? globalThis.window),
});
