import { describe, expect, it, vi } from 'vitest';
import { combineWaveClips, createAudioPlayer } from './audio-player';

/** A minimal stand-in for `HTMLAudioElement`, just enough for the player port. */
class FakeAudioElement {
  src = '';
  currentTime = 0;
  duration = 0;
  played = 0;
  paused = false;
  loaded = 0;
  removedAttribute: string | null = null;
  onLoad: (() => void) | null = null;
  private readonly listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();

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
    this.onLoad?.();
  }

  removeAttribute(name: string): void {
    this.removedAttribute = name;
  }

  addEventListener(type: string, handler: EventListenerOrEventListenerObject): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(handler);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, handler: EventListenerOrEventListenerObject): void {
    this.listeners.get(type)?.delete(handler);
  }

  fire(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) {
      if (typeof listener === 'function') {
        listener(new Event(type));
      } else {
        listener.handleEvent(new Event(type));
      }
    }
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

function wave(samples: readonly number[], sampleRate = 2): Blob {
  const output = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(output);
  const write = (offset: number, value: string): void => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };
  write(0, 'RIFF');
  view.setUint32(4, output.byteLength - 8, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, index) => {
    view.setInt16(44 + index * 2, sample, true);
  });
  return new Blob([output], { type: 'audio/wav' });
}

class FakeSourceBuffer extends EventTarget {
  mode: AppendMode = 'segments';
  aborts = 0;
  appends = 0;
  private end = 0;
  readonly buffered = {
    get length() {
      return 1;
    },
    start: () => 0,
    end: () => this.end,
  } as TimeRanges;

  appendBuffer(): void {
    this.appends += 1;
    this.end += 1;
    queueMicrotask(() => this.dispatchEvent(new Event('updateend')));
  }

  abort(): void {
    this.aborts += 1;
  }
}

class FakeMediaSource extends EventTarget {
  static isTypeSupported(type: string): boolean {
    return type === 'audio/mpeg';
  }

  readonly sourceBuffer = new FakeSourceBuffer();
  readyState: ReadyState = 'open';
  ended = false;

  addSourceBuffer(): SourceBuffer {
    return this.sourceBuffer as unknown as SourceBuffer;
  }

  endOfStream(): void {
    this.ended = true;
    this.readyState = 'ended';
  }
}

/** A view whose `MediaSource` opens as soon as the element loads it. */
function mpegView(element: FakeAudioElement): ReturnType<typeof fakeView> {
  const fake = fakeView(element);
  (fake.view as unknown as { MediaSource: typeof MediaSource }).MediaSource =
    FakeMediaSource as unknown as typeof MediaSource;
  element.onLoad = () => {
    queueMicrotask(() => {
      const source = fake.createObjectURL.mock.calls.at(-1)?.[0] as FakeMediaSource | undefined;
      source?.dispatchEvent(new Event('sourceopen'));
    });
  };
  return fake;
}

function sourceOf(fake: ReturnType<typeof fakeView>): FakeMediaSource {
  return fake.createObjectURL.mock.calls.at(-1)?.[0] as FakeMediaSource;
}

/** Lets the player's own queued source-buffer work run to completion. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function mpeg(name: string): { readonly blob: Blob; readonly mimeType: 'audio/mpeg' } {
  return { blob: new Blob([name]), mimeType: 'audio/mpeg' };
}

describe('createAudioPlayer', () => {
  it('combines compatible WAV clips and records exact sentence boundaries', async () => {
    const combined = await combineWaveClips([wave([1, 2]), wave([3, 4, 5, 6])]);

    expect(combined.timeline).toEqual({ starts: [0, 1], duration: 3, open: false, floor: 0 });
    expect(combined.blob.type).toBe('audio/wav');
    const bytes = new DataView(await combined.blob.arrayBuffer());
    expect(bytes.getUint32(4, true)).toBe(48);
    expect(bytes.getUint32(40, true)).toBe(12);
  });

  it('rejects a WAV sequence whose sample formats differ', async () => {
    await expect(combineWaveClips([wave([1, 2], 2), wave([3, 4], 4)])).rejects.toThrow(
      'different formats',
    );
  });

  it('appends MP3 sentences as one MediaSource timeline before playing', async () => {
    const element = new FakeAudioElement();
    const fake = fakeView(element);
    (fake.view as unknown as { MediaSource: typeof MediaSource }).MediaSource =
      FakeMediaSource as unknown as typeof MediaSource;
    element.onLoad = () => {
      queueMicrotask(() => {
        const source = fake.createObjectURL.mock.calls[0]?.[0] as FakeMediaSource;
        source.dispatchEvent(new Event('sourceopen'));
      });
    };
    const player = createAudioPlayer(fake.view);

    const timeline = await player.playSequence([
      { blob: new Blob(['one']), mimeType: 'audio/mpeg' },
      { blob: new Blob(['two']), mimeType: 'audio/mpeg' },
      { blob: new Blob(['three']), mimeType: 'audio/mpeg' },
    ]);

    expect(timeline).toEqual({ starts: [0, 1, 2], duration: 3, open: false, floor: 0 });
    expect(element.played).toBe(1);
    expect(fake.createObjectURL).toHaveBeenCalledTimes(1);
  });

  /**
   * The whole reason an open resource exists: a reading started before it has
   * been generated grows inside the element rather than being reloaded at every
   * seam, so nothing has to run between two sentences for the next one to play.
   */
  it('keeps an open sequence accepting sentences made after it started', async () => {
    const element = new FakeAudioElement();
    const fake = mpegView(element);
    const player = createAudioPlayer(fake.view);

    const started = await player.playSequence([mpeg('one'), mpeg('two')], { open: true });
    const grown = await player.extendSequence([mpeg('three')]);

    expect(started).toEqual({ starts: [0, 1], duration: 2, open: true, floor: 0 });
    expect(grown).toEqual({ starts: [0, 1, 2], duration: 3, open: true, floor: 0 });
    expect(player.sequenceOpen()).toBe(true);
    expect(sourceOf(fake).ended).toBe(false);
    // One resource, played once: the element was never given a new source.
    expect(fake.createObjectURL).toHaveBeenCalledTimes(1);
    expect(element.played).toBe(1);
    expect(player.duration()).toBe(3);
  });

  it('ends the stream when the sequence is closed', async () => {
    const element = new FakeAudioElement();
    const fake = mpegView(element);
    const player = createAudioPlayer(fake.view);
    await player.playSequence([mpeg('one')], { open: true });

    player.closeSequence();
    await settle();

    expect(sourceOf(fake).ended).toBe(true);
    expect(player.sequenceOpen()).toBe(false);
  });

  it('refuses to extend a sequence a newer clip replaced', async () => {
    const element = new FakeAudioElement();
    const fake = mpegView(element);
    const player = createAudioPlayer(fake.view);
    await player.playSequence([mpeg('one')], { open: true });
    const source = sourceOf(fake);

    await player.play(new Blob(['newer']));

    expect(source.sourceBuffer.aborts).toBe(1);
    expect(player.sequenceOpen()).toBe(false);
    await expect(player.extendSequence([mpeg('two')])).rejects.toThrow('No audio sequence is open');
  });

  it('refuses to extend when no sequence is open', async () => {
    const player = createAudioPlayer(mpegView(new FakeAudioElement()).view);

    await expect(player.extendSequence([mpeg('one')])).rejects.toThrow('No audio sequence is open');
  });

  /**
   * A RIFF header states its own data length, so a WAV resource cannot grow.
   * Asking for one open builds it closed rather than promising an append that
   * would have to rewrite the blob and interrupt the reading.
   */
  it('builds a WAV sequence closed even when it is asked for open', async () => {
    const element = new FakeAudioElement();
    const player = createAudioPlayer(mpegView(element).view);

    const timeline = await player.playSequence([{ blob: wave([1, 2]), mimeType: 'audio/wav' }], {
      open: true,
    });

    expect(timeline.open).toBe(false);
    expect(player.sequenceOpen()).toBe(false);
  });

  it('forwards running out of audio and starting again, and nothing after a stop', async () => {
    const element = new FakeAudioElement();
    const player = createAudioPlayer(fakeView(element).view);
    const stalled = vi.fn();
    const resumed = vi.fn();
    player.onStalled(stalled);
    player.onResumed(resumed);
    await player.play(new Blob(['clip']));

    element.fire('waiting');
    element.fire('playing');
    player.stop();
    element.fire('waiting');
    element.fire('playing');

    expect(stalled).toHaveBeenCalledTimes(1);
    expect(resumed).toHaveBeenCalledTimes(1);
  });

  it('does not let a slow sequence replace a newer clip', async () => {
    const element = new FakeAudioElement();
    const fake = fakeView(element);
    const player = createAudioPlayer(fake.view);
    const delayed = wave([1, 2]);
    const bytes = await delayed.arrayBuffer();
    const deferred: { resolve?: (value: ArrayBuffer) => void } = {};
    vi.spyOn(delayed, 'arrayBuffer').mockImplementation(
      () =>
        new Promise<ArrayBuffer>((resolve) => {
          deferred.resolve = resolve;
        }),
    );

    const sequence = player.playSequence([{ blob: delayed, mimeType: 'audio/wav' }]);
    await player.play(new Blob(['newer']));
    deferred.resolve?.(bytes);

    await expect(sequence).rejects.toThrow('superseded');
    expect(fake.createObjectURL).toHaveBeenCalledTimes(1);
    expect(element.played).toBe(1);
  });

  it('reports how far into the loaded clip playback has reached', async () => {
    const element = new FakeAudioElement();
    const player = createAudioPlayer(fakeView(element).view);

    await player.play(new Blob(['a']));
    element.currentTime = 3.5;

    expect(player.elapsed()).toBe(3.5);
  });

  it('restarts the loaded clip without loading it again', async () => {
    const element = new FakeAudioElement();
    const { view, createObjectURL } = fakeView(element);
    const player = createAudioPlayer(view);

    await player.play(new Blob(['a']));
    element.currentTime = 3.5;
    await player.restart();

    expect(element.currentTime).toBe(0);
    expect(element.played).toBe(2);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

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

  it('forwards ended and error events to registered handlers', async () => {
    const element = new FakeAudioElement();
    const { view } = fakeView(element);
    const player = createAudioPlayer(view);
    const ended = vi.fn();
    const error = vi.fn();

    player.onEnded(ended);
    player.onError(error);
    await player.play(new Blob(['clip']));
    element.fire('ended');
    element.fire('error');

    expect(ended).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
  });

  /**
   * `stop()` unloads the element, and unloading is itself something an engine
   * may report as an error. Forwarding that would post a failure banner naming
   * the sentence the learner had just stopped on purpose.
   */
  it('reports nothing once the element has been unloaded', async () => {
    const element = new FakeAudioElement();
    const { view } = fakeView(element);
    const player = createAudioPlayer(view);
    const ended = vi.fn();
    const error = vi.fn();
    player.onEnded(ended);
    player.onError(error);
    await player.play(new Blob(['clip']));

    player.stop();
    element.fire('ended');
    element.fire('error');

    expect(ended).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  /** A clip loaded already paused is the only way a Pause during a load can be honoured. */
  it('loads a clip without starting it when it is asked for paused', async () => {
    const element = new FakeAudioElement();
    const { view } = fakeView(element);
    const player = createAudioPlayer(view);

    await player.play(new Blob(['clip']), { startPaused: true });

    expect(element.src).toBe('blob:one');
    expect(element.played).toBe(0);

    await player.resume();

    expect(element.played).toBe(1);
  });
});
