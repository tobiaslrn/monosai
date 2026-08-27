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
  /** Drops the metadata, so a stopped reading leaves no lock screen behind. */
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

/**
 * The notification's icon, resolved against the document base.
 *
 * Without it Chrome falls back to the site favicon and a reading in the
 * notification shade looks like a stray browser tab. Resolved rather than
 * hard-coded because the build bakes `<base href="/monosai/">`, so a root-
 * relative path would point outside the deployment.
 */
function artworkFor(view: Window & typeof globalThis): readonly MediaImage[] {
  const baseUri = (view.document as Document | undefined)?.baseURI;
  if (typeof baseUri !== 'string') {
    return [];
  }
  try {
    return [
      { src: new URL('icons/icon-512.png', baseUri).href, sizes: '512x512', type: 'image/png' },
    ];
  } catch {
    return [];
  }
}

export function createMediaSession(view: (Window & typeof globalThis) | null): MediaSessionAdapter {
  const session = view?.navigator.mediaSession;
  const MetadataConstructor = view?.MediaMetadata;
  if (view === null || session === undefined || MetadataConstructor === undefined) {
    return NO_MEDIA_SESSION;
  }

  const artwork = artworkFor(view);
  /**
   * Kept so every publish can re-register them.
   *
   * The handlers used to be registered once and nulled by `clear()`, which
   * meant the first stop left every later notification with dead buttons for
   * the rest of the page's life.
   */
  let handlers: MediaSessionHandlers | null = null;

  const applyHandlers = (): void => {
    if (handlers === null) {
      return;
    }
    session.setActionHandler('play', handlers.play);
    session.setActionHandler('pause', handlers.pause);
    session.setActionHandler('stop', handlers.stop);
    session.setActionHandler('nexttrack', handlers.next);
    session.setActionHandler('previoustrack', handlers.previous);
  };

  return {
    supported: true,
    setHandlers(next: MediaSessionHandlers): void {
      handlers = next;
      applyHandlers();
    },
    setMetadata(metadata: MediaSessionMetadata): void {
      session.metadata = new MetadataConstructor({
        title: metadata.title,
        artist: metadata.artist,
        album: metadata.album,
        artwork: [...artwork],
      });
      // A browser may drop handlers along with a session it considers over, so
      // every publish re-asserts them rather than trusting the one at startup.
      applyHandlers();
    },
    setPlaybackState(state: 'none' | 'playing' | 'paused'): void {
      session.playbackState = state;
    },
    clear(): void {
      session.metadata = null;
      session.playbackState = 'none';
      // The handlers deliberately survive: the same store is still the thing
      // that would answer the next notification, and nulling them here is what
      // left restarted playback with a lock screen that could not be pressed.
    },
  };
}

/** Resolves to the browser's media session, the no-op adapter, or a fake. */
export const MEDIA_SESSION = new InjectionToken<MediaSessionAdapter>('monosai.media-session', {
  providedIn: 'root',
  factory: () => createMediaSession(inject(DOCUMENT).defaultView),
});
