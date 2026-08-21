import { describe, expect, it, vi } from 'vitest';
import { createAudioPlayer } from './audio-player';

/** A minimal stand-in for `HTMLAudioElement`, just enough for the player port. */
class FakeAudioElement {
  src = '';
  played = 0;
  paused = false;
  loaded = 0;
  removedAttribute: string | null = null;
  private readonly listeners = new Map<string, () => void>();

  play(): Promise<void> {
    this.played += 1;
    this.paused = false;
    return Promise.resolve();
  }

  pause(): void {
    this.paused = true;
  }

  load(): void {
    this.loaded += 1;
  }

  removeAttribute(name: string): void {
    this.removedAttribute = name;
  }

  addEventListener(type: string, handler: () => void): void {
    this.listeners.set(type, handler);
  }

  fire(type: string): void {
    this.listeners.get(type)?.();
  }
}

function fakeView(element: FakeAudioElement): {
  readonly view: Window & typeof globalThis;
  readonly createObjectURL: ReturnType<typeof vi.fn>;
  readonly revokeObjectURL: ReturnType<typeof vi.fn>;
} {
  const createObjectURL = vi.fn(() => 'blob:one');
  const revokeObjectURL = vi.fn();
  const view = {
    Audio: function Audio(this: unknown) {
      return element;
    },
    URL: { createObjectURL, revokeObjectURL },
  } as unknown as Window & typeof globalThis;
  return { view, createObjectURL, revokeObjectURL };
}

describe('createAudioPlayer', () => {
  it('plays a clip without revoking a URL that does not exist yet', async () => {
    const element = new FakeAudioElement();
    const { view, createObjectURL, revokeObjectURL } = fakeView(element);
    const player = createAudioPlayer(view);

    await player.play(new Blob(['a']));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    expect(element.src).toBe('blob:one');
    expect(element.played).toBe(1);
  });

  it('revokes the previous URL when a second clip is loaded', async () => {
    const element = new FakeAudioElement();
    const { view, revokeObjectURL } = fakeView(element);
    const player = createAudioPlayer(view);

    await player.play(new Blob(['a']));
    await player.play(new Blob(['b']));

    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it('pauses and resumes the element', async () => {
    const element = new FakeAudioElement();
    const { view } = fakeView(element);
    const player = createAudioPlayer(view);
    await player.play(new Blob(['a']));

    player.pause();
    expect(element.paused).toBe(true);

    await player.resume();
    expect(element.played).toBe(2);
  });

  it('stops, unloads, and revokes the current URL', async () => {
    const element = new FakeAudioElement();
    const { view, revokeObjectURL } = fakeView(element);
    const player = createAudioPlayer(view);
    await player.play(new Blob(['a']));

    player.stop();

    expect(element.paused).toBe(true);
    expect(element.removedAttribute).toBe('src');
    expect(element.loaded).toBe(1);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it('does nothing when stop is called with nothing loaded', () => {
    const element = new FakeAudioElement();
    const { view, revokeObjectURL } = fakeView(element);
    const player = createAudioPlayer(view);

    player.stop();

    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  it('forwards ended and error events to registered handlers', () => {
    const element = new FakeAudioElement();
    const { view } = fakeView(element);
    const player = createAudioPlayer(view);
    const ended = vi.fn();
    const error = vi.fn();

    player.onEnded(ended);
    player.onError(error);
    element.fire('ended');
    element.fire('error');

    expect(ended).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
  });
});
