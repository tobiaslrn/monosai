import { DOCUMENT, InjectionToken, inject } from '@angular/core';

/** What the lock screen and headset controls can ask for. */
export interface MediaSessionHandlers {
  readonly play: () => void;
  readonly pause: () => void;
  readonly stop: () => void;
  readonly next: () => void;
  readonly previous: () => void;
}

export interface MediaSessionMetadata {
  /** Where in the reading playback is, which is what a lock screen can use. */
  readonly title: string;
  /** The reading being read. */
  readonly artist: string;
  readonly album: string;
}

/**
 * Lock-screen and headset control, where the browser offers it.
 *
 * Android is where a reading is actually listened to away from the screen, so
 * this is most of the value of the player there; it is also entirely optional,
 * which is why it sits behind an interface that a browser without the API
 * satisfies by doing nothing. Feature detection happens once here rather than
 * at each call site.
 */
export interface MediaSessionAdapter {
  readonly supported: boolean;
  setHandlers(handlers: MediaSessionHandlers): void;
  setMetadata(metadata: MediaSessionMetadata): void;
  setPlaybackState(state: 'none' | 'playing' | 'paused'): void;
  /** Drops metadata and handlers, so a stopped reading leaves no lock screen. */
  clear(): void;
}

/** Adapter for a browser without `navigator.mediaSession`. Does nothing, safely. */
export const NO_MEDIA_SESSION: MediaSessionAdapter = {
  supported: false,
  setHandlers: () => undefined,
  setMetadata: () => undefined,
  setPlaybackState: () => undefined,
  clear: () => undefined,
};

export function createMediaSession(view: (Window & typeof globalThis) | null): MediaSessionAdapter {
  const session = view?.navigator.mediaSession;
  const MetadataConstructor = view?.MediaMetadata;
  if (session === undefined || MetadataConstructor === undefined) {
    return NO_MEDIA_SESSION;
  }

  return {
    supported: true,
    setHandlers(handlers: MediaSessionHandlers): void {
      session.setActionHandler('play', handlers.play);
      session.setActionHandler('pause', handlers.pause);
      session.setActionHandler('stop', handlers.stop);
      session.setActionHandler('nexttrack', handlers.next);
      session.setActionHandler('previoustrack', handlers.previous);
    },
    setMetadata(metadata: MediaSessionMetadata): void {
      session.metadata = new MetadataConstructor({
        title: metadata.title,
        artist: metadata.artist,
        album: metadata.album,
      });
    },
    setPlaybackState(state: 'none' | 'playing' | 'paused'): void {
      session.playbackState = state;
    },
    clear(): void {
      session.metadata = null;
      session.playbackState = 'none';
      for (const action of ['play', 'pause', 'stop', 'nexttrack', 'previoustrack'] as const) {
        session.setActionHandler(action, null);
      }
    },
  };
}

/** Resolves to the browser's media session, the no-op adapter, or a fake. */
export const MEDIA_SESSION = new InjectionToken<MediaSessionAdapter>('monosai.media-session', {
  providedIn: 'root',
  factory: () => createMediaSession(inject(DOCUMENT).defaultView),
});
