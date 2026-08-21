import { describe, expect, it, vi } from 'vitest';
import { NO_MEDIA_SESSION, createMediaSession } from './media-session';

interface RecordedSession {
  metadata: unknown;
  playbackState: string;
  readonly handlers: Map<string, unknown>;
}

/** A `navigator.mediaSession` that records rather than reaches the lock screen. */
function fakeView(): { view: Window & typeof globalThis; session: RecordedSession } {
  const session: RecordedSession = {
    metadata: null,
    playbackState: 'none',
    handlers: new Map(),
  };
  const view = {
    navigator: {
      mediaSession: {
        get metadata() {
          return session.metadata;
        },
        set metadata(value: unknown) {
          session.metadata = value;
        },
        get playbackState() {
          return session.playbackState;
        },
        set playbackState(value: string) {
          session.playbackState = value;
        },
        setActionHandler: (action: string, handler: unknown) => {
          session.handlers.set(action, handler);
        },
      },
    },
    MediaMetadata: class {
      constructor(readonly init: unknown) {}
    },
  } as unknown as Window & typeof globalThis;
  return { view, session };
}

const HANDLERS = {
  play: vi.fn(),
  pause: vi.fn(),
  stop: vi.fn(),
  next: vi.fn(),
  previous: vi.fn(),
};

describe('createMediaSession', () => {
  /**
   * Feature detection happens once, here, rather than at each call site. A
   * browser without the API satisfies the interface by doing nothing, so the
   * playback store never has to ask whether the lock screen exists.
   */
  it('falls back to the no-op adapter when the browser has no media session', () => {
    expect(createMediaSession(null)).toBe(NO_MEDIA_SESSION);
    expect(createMediaSession({ navigator: {} } as unknown as Window & typeof globalThis)).toBe(
      NO_MEDIA_SESSION,
    );
  });

  it('falls back when the session exists but MediaMetadata does not', () => {
    const view = {
      navigator: { mediaSession: { setActionHandler: () => undefined } },
    } as unknown as Window & typeof globalThis;

    expect(createMediaSession(view)).toBe(NO_MEDIA_SESSION);
  });

  it('reports itself supported and registers every transport action', () => {
    const { view, session } = fakeView();

    const adapter = createMediaSession(view);
    adapter.setHandlers(HANDLERS);

    expect(adapter.supported).toBe(true);
    expect([...session.handlers.keys()].sort()).toEqual([
      'nexttrack',
      'pause',
      'play',
      'previoustrack',
      'stop',
    ]);
  });

  it('publishes where in the reading playback is', () => {
    const { view, session } = fakeView();
    const adapter = createMediaSession(view);

    adapter.setMetadata({ title: 'Sentence 3 of 9', artist: '第一章', album: 'Monosai' });
    adapter.setPlaybackState('playing');

    expect(session.metadata).toMatchObject({
      init: { title: 'Sentence 3 of 9', artist: '第一章', album: 'Monosai' },
    });
    expect(session.playbackState).toBe('playing');
  });

  /** A stopped reading leaves no lock screen behind. */
  it('drops metadata and every handler when cleared', () => {
    const { view, session } = fakeView();
    const adapter = createMediaSession(view);
    adapter.setHandlers(HANDLERS);
    adapter.setMetadata({ title: 'Sentence 1 of 9', artist: '第一章', album: 'Monosai' });
    adapter.setPlaybackState('playing');

    adapter.clear();

    expect(session.metadata).toBeNull();
    expect(session.playbackState).toBe('none');
    expect([...session.handlers.values()].every((handler) => handler === null)).toBe(true);
  });

  it('does nothing at all, and throws nothing, without the API', () => {
    expect(() => {
      NO_MEDIA_SESSION.setHandlers(HANDLERS);
      NO_MEDIA_SESSION.setMetadata({ title: 't', artist: 'a', album: 'Monosai' });
      NO_MEDIA_SESSION.setPlaybackState('playing');
      NO_MEDIA_SESSION.clear();
    }).not.toThrow();
    expect(NO_MEDIA_SESSION.supported).toBe(false);
  });
});
