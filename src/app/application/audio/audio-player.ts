import { DOCUMENT, InjectionToken, inject } from '@angular/core';

/** How a clip is loaded: playing at once, or held at its start. */
export interface PlayOptions {
  /**
   * Loads the clip without starting it.
   *
   * A Pause pressed while the next sentence was still being read from storage
   * used to be dropped, and the sentence then started anyway. Honouring it
   * means the clip has to arrive already paused rather than being played and
   * silenced a frame later.
   */
  readonly startPaused?: boolean;
}

export interface SequencePlayOptions extends PlayOptions {
  /** Zero-based sentence whose boundary should be the initial position. */
  readonly startIndex?: number;
}

export interface AudioSequenceClip {
  readonly blob: Blob;
  readonly mimeType: 'audio/mpeg' | 'audio/wav';
}

export interface AudioTimeline {
  /** Start of each sentence in seconds, in the same order as the input clips. */
  readonly starts: readonly number[];
  readonly duration: number;
}

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
  play(clip: Blob, options?: PlayOptions): Promise<void>;
  /** Builds and plays one native media resource from a complete reading. */
  playSequence(
    clips: readonly AudioSequenceClip[],
    options?: SequencePlayOptions,
  ): Promise<AudioTimeline>;
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
  duration(): number;
  seek(seconds: number): void;
  /** Plays the loaded clip again from its start, without reloading it. */
  restart(): Promise<void>;
  /** Called when the loaded clip finishes on its own. */
  onEnded(handler: () => void): void;
  /** Called when the loaded clip cannot be decoded or played. */
  onError(handler: () => void): void;
  /** Called while the native element advances, including in the background. */
  onTimeUpdate(handler: () => void): void;
}

interface WaveFormat {
  readonly channels: number;
  readonly sampleRate: number;
  readonly byteRate: number;
  readonly blockAlign: number;
  readonly bitsPerSample: number;
}

interface ParsedWave {
  readonly format: WaveFormat;
  readonly data: Uint8Array;
}

function ascii(view: DataView, offset: number, length: number): string {
  return String.fromCharCode(...new Uint8Array(view.buffer, view.byteOffset + offset, length));
}

function parseWave(bytes: ArrayBuffer): ParsedWave {
  const view = new DataView(bytes);
  if (view.byteLength < 44 || ascii(view, 0, 4) !== 'RIFF' || ascii(view, 8, 4) !== 'WAVE') {
    throw new Error('Invalid WAV container');
  }

  let format: WaveFormat | null = null;
  let data: Uint8Array | null = null;
  for (let offset = 12; offset + 8 <= view.byteLength;) {
    const id = ascii(view, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (body + size > view.byteLength) {
      throw new Error('Truncated WAV chunk');
    }
    if (id === 'fmt ') {
      if (size < 16 || view.getUint16(body, true) !== 1) {
        throw new Error('Unsupported WAV encoding');
      }
      format = {
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        byteRate: view.getUint32(body + 8, true),
        blockAlign: view.getUint16(body + 12, true),
        bitsPerSample: view.getUint16(body + 14, true),
      };
    } else if (id === 'data') {
      data = new Uint8Array(bytes, body, size);
    }
    offset = body + size + (size % 2);
  }
  if (format === null || data === null || format.byteRate === 0 || format.blockAlign === 0) {
    throw new Error('Incomplete WAV container');
  }
  if (data.byteLength % format.blockAlign !== 0) {
    throw new Error('Misaligned WAV audio data');
  }
  return { format, data };
}

function sameWaveFormat(left: WaveFormat, right: WaveFormat): boolean {
  return (
    left.channels === right.channels &&
    left.sampleRate === right.sampleRate &&
    left.byteRate === right.byteRate &&
    left.blockAlign === right.blockAlign &&
    left.bitsPerSample === right.bitsPerSample
  );
}

/** Joins compatible PCM WAV clips without decoding or changing their samples. */
export async function combineWaveClips(
  clips: readonly Blob[],
): Promise<{ readonly blob: Blob; readonly timeline: AudioTimeline }> {
  if (clips.length === 0) {
    throw new Error('A sequence needs at least one clip');
  }
  const parsed = await Promise.all(clips.map(async (clip) => parseWave(await clip.arrayBuffer())));
  const format = parsed[0].format;
  if (!parsed.every((clip) => sameWaveFormat(format, clip.format))) {
    throw new Error('WAV clips use different formats');
  }
  const dataLength = parsed.reduce((total, clip) => total + clip.data.byteLength, 0);
  if (dataLength > 0xffff_ffff - 44) {
    throw new Error('WAV sequence is too large');
  }
  const output = new ArrayBuffer(44 + dataLength);
  const view = new DataView(output);
  const writeAscii = (offset: number, value: string): void => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };
  writeAscii(0, 'RIFF');
  view.setUint32(4, output.byteLength - 8, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, format.channels, true);
  view.setUint32(24, format.sampleRate, true);
  view.setUint32(28, format.byteRate, true);
  view.setUint16(32, format.blockAlign, true);
  view.setUint16(34, format.bitsPerSample, true);
  writeAscii(36, 'data');
  view.setUint32(40, dataLength, true);

  const starts: number[] = [];
  let byteOffset = 44;
  let elapsed = 0;
  for (const clip of parsed) {
    starts.push(elapsed);
    new Uint8Array(output, byteOffset, clip.data.byteLength).set(clip.data);
    byteOffset += clip.data.byteLength;
    elapsed += clip.data.byteLength / format.byteRate;
  }
  return {
    blob: new Blob([output], { type: 'audio/wav' }),
    timeline: { starts, duration: elapsed },
  };
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
  let trackDuration = 0;
  /** Latest-wins guard for sequence assembly racing a newer source or Stop. */
  let operationToken = 0;
  /**
   * Whether a clip is loaded at all.
   *
   * `stop()` unloads the element, and unloading is itself something an engine
   * may report as an error. Reporting that as an undecodable clip would post a
   * failure banner about a sentence the learner had just stopped on purpose.
   */
  let loaded = false;

  const release = (): void => {
    if (objectUrl !== null) {
      view.URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
  };

  const loadBlob = (blob: Blob): void => {
    release();
    objectUrl = view.URL.createObjectURL(blob);
    element.src = objectUrl;
    loaded = true;
  };

  const waitFor = (target: EventTarget, type: string): Promise<void> =>
    new Promise((resolve, reject) => {
      const onEvent = (): void => {
        cleanup();
        resolve();
      };
      const onError = (): void => {
        cleanup();
        reject(new Error(`Media ${type} failed`));
      };
      const cleanup = (): void => {
        target.removeEventListener(type, onEvent);
        target.removeEventListener('error', onError);
      };
      target.addEventListener(type, onEvent, { once: true });
      target.addEventListener('error', onError, { once: true });
    });

  const buildMpegSequence = async (
    clips: readonly Blob[],
    token: number,
  ): Promise<AudioTimeline> => {
    const assertCurrent = (): void => {
      if (token !== operationToken) {
        throw new Error('Audio load was superseded');
      }
    };
    const MediaSourceConstructor = Reflect.get(view, 'MediaSource') as
      typeof MediaSource | undefined;
    if (MediaSourceConstructor?.isTypeSupported('audio/mpeg') !== true) {
      throw new Error('MPEG MediaSource is unavailable');
    }
    release();
    const source = new MediaSourceConstructor();
    objectUrl = view.URL.createObjectURL(source);
    element.src = objectUrl;
    loaded = true;
    element.load();
    await waitFor(source, 'sourceopen');
    assertCurrent();
    const sourceBuffer = source.addSourceBuffer('audio/mpeg');
    sourceBuffer.mode = 'sequence';
    const starts: number[] = [];
    let end = 0;
    for (const clip of clips) {
      starts.push(end);
      const bytes = await clip.arrayBuffer();
      assertCurrent();
      const updated = waitFor(sourceBuffer, 'updateend');
      sourceBuffer.appendBuffer(bytes);
      await updated;
      assertCurrent();
      if (sourceBuffer.buffered.length === 0) {
        throw new Error('MPEG sequence produced no buffered audio');
      }
      end = sourceBuffer.buffered.end(sourceBuffer.buffered.length - 1);
    }
    source.endOfStream();
    if (!Number.isFinite(end) || end <= 0) {
      throw new Error('MPEG sequence has no duration');
    }
    return { starts, duration: end };
  };

  return {
    async play(clip: Blob, options?: PlayOptions): Promise<void> {
      operationToken += 1;
      trackDuration = 0;
      loadBlob(clip);
      if (options?.startPaused === true) {
        element.load();
        return;
      }
      await element.play();
    },
    async playSequence(
      clips: readonly AudioSequenceClip[],
      options?: SequencePlayOptions,
    ): Promise<AudioTimeline> {
      const token = (operationToken += 1);
      if (clips.length === 0) {
        throw new Error('A sequence needs at least one clip');
      }
      const mimeType = clips[0].mimeType;
      if (!clips.every((clip) => clip.mimeType === mimeType)) {
        throw new Error('A sequence cannot mix audio formats');
      }
      const timeline =
        mimeType === 'audio/wav'
          ? await combineWaveClips(clips.map((clip) => clip.blob)).then((combined) => {
              if (token !== operationToken) {
                throw new Error('Audio load was superseded');
              }
              loadBlob(combined.blob);
              return combined.timeline;
            })
          : await buildMpegSequence(
              clips.map((clip) => clip.blob),
              token,
            );
      if (token !== operationToken) {
        throw new Error('Audio load was superseded');
      }
      trackDuration = timeline.duration;
      const startIndex = Math.min(Math.max(options?.startIndex ?? 0, 0), clips.length - 1);
      element.currentTime = timeline.starts[startIndex];
      if (options?.startPaused === true) {
        return timeline;
      }
      await element.play();
      return timeline;
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
    duration(): number {
      return trackDuration > 0 ? trackDuration : element.duration;
    },
    seek(seconds: number): void {
      const duration = trackDuration > 0 ? trackDuration : element.duration;
      const upper = Number.isFinite(duration) ? duration : Number.MAX_SAFE_INTEGER;
      element.currentTime = Math.min(Math.max(seconds, 0), upper);
    },
    async restart(): Promise<void> {
      element.currentTime = 0;
      await element.play();
    },
    stop(): void {
      operationToken += 1;
      loaded = false;
      trackDuration = 0;
      element.pause();
      element.removeAttribute('src');
      element.load();
      release();
    },
    onEnded(handler: () => void): void {
      element.addEventListener('ended', () => {
        if (loaded) {
          handler();
        }
      });
    },
    onError(handler: () => void): void {
      element.addEventListener('error', () => {
        if (loaded) {
          handler();
        }
      });
    },
    onTimeUpdate(handler: () => void): void {
      element.addEventListener('timeupdate', () => {
        if (loaded) {
          handler();
        }
      });
    },
  };
}

/** Resolves to the single browser player, or a fake in tests. */
export const AUDIO_PLAYER = new InjectionToken<AudioPlayer>('monosai.audio-player', {
  providedIn: 'root',
  factory: () => createAudioPlayer(inject(DOCUMENT).defaultView ?? globalThis.window),
});
