import type { AudioDecoder, DecodeOutcome, DecoderCheck } from '../../domain/audio/audio-decoder';

export type { AudioDecoder, DecodeOutcome };

type DecodingContext = BaseAudioContext & { close?: () => Promise<void> };
type DecodingContextConstructor = new (...args: number[]) => DecodingContext;

/**
 * Decoder backed by the browser's own audio pipeline.
 *
 * An offline context renders nothing and holds no audio device, so the engine
 * cap on open contexts, which can refuse a live one, does not apply to it. A
 * live context is the fallback for a browser without one. The prefixed names
 * are what older WebKit has.
 *
 * Asked before anything is paid for whether it can decode at all: a browser
 * with no context constructor answers no at once, and otherwise it decodes a
 * tiny built-in clip once. A browser that makes contexts but decodes nothing
 * is found out by that clip rather than by one bought from the provider. A
 * browser found to have nothing to decode with, by that check or by a clip
 * whose contexts all refused, is remembered as having none for as long as
 * this tab lives, so no second clip is bought to find out again.
 *
 * `decodeAudioData` detaches the buffer it is given, so it always receives a
 * copy: the verified clip has to survive for the learner to play it.
 *
 * A decode that never answers would stall a run or a voice test for good, so
 * each one gives up after `DECODE_TIMEOUT_MS`. Giving up proves nothing about
 * the browser: a clip that timed out is undecodable, like any clip that did
 * not decode, and a check that timed out says so without being remembered, so
 * the next check asks again.
 */
export function createAudioDecoder(view: Window): AudioDecoder {
  let missing = false;
  let checked: Promise<DecoderCheck> | null = null;
  const available = (): boolean => {
    const { offline, live } = contextConstructors(view);
    if (offline === null && live === null) {
      missing = true;
    }
    return !missing;
  };
  return {
    available,
    checkDecoding: () => {
      if (!available()) {
        return Promise.resolve('no-decoder');
      }
      checked ??= decodesProbe(view).then((found) => {
        if (found === 'no-decoder') {
          missing = true;
        }
        if (found === 'timed-out') {
          checked = null;
        }
        return found;
      });
      return checked.then((found) => (found === 'decodes' && missing ? 'no-decoder' : found));
    },
    decode: async (bytes: ArrayBuffer): Promise<DecodeOutcome> => {
      const context = missing ? null : openContext(view);
      if (context === null) {
        missing = true;
        return { kind: 'no-decoder' };
      }
      let answered = true;
      try {
        const buffer = await decodeWith(context, bytes.slice(0));
        return { kind: 'decoded', durationSeconds: buffer.duration };
      } catch (error) {
        answered = !(error instanceof DecodeTimeout);
        return { kind: 'undecodable' };
      } finally {
        await release(context, answered);
      }
    },
  };
}

/** What a context this browser makes does with the built-in clip. */
async function decodesProbe(view: Window): Promise<DecoderCheck> {
  const context = openContext(view);
  if (context === null) {
    return 'no-decoder';
  }
  let answered = true;
  try {
    await decodeWith(context, probeClip());
    return 'decodes';
  } catch (error) {
    answered = !(error instanceof DecodeTimeout);
    return answered ? 'no-decoder' : 'timed-out';
  } finally {
    await release(context, answered);
  }
}

/**
 * Closes a context. One whose decode never answered is not waited on, since
 * it may not answer this either.
 */
async function release(context: DecodingContext, answered: boolean): Promise<void> {
  const closing = context.close?.();
  if (answered) {
    await closing;
  } else {
    closing?.catch(() => undefined);
  }
}

/** Frames of silence in the built-in clip: enough that no decoder sees it as empty. */
const PROBE_FRAMES = 128;
const PROBE_RATE = 8_000;

/**
 * A mono 16-bit PCM WAV of silence, the plainest clip every decoder reads.
 * Built afresh each time, since decoding detaches the buffer it is given.
 */
export function probeClip(): ArrayBuffer {
  const dataBytes = PROBE_FRAMES * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const ascii = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, PROBE_RATE, true);
  view.setUint32(28, PROBE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, dataBytes, true);
  return buffer;
}

/**
 * How long one decode may take before it is given up. A sentence's clip
 * decodes in well under a second even on a slow phone, and the longest clip
 * Monosai keeps, a long sentence read slowly, in a few; ten seconds leaves room
 * for a busy device without letting a decoder that never answers stall a run.
 */
export const DECODE_TIMEOUT_MS = 10_000;

/** A decode that did not answer within `DECODE_TIMEOUT_MS`. */
class DecodeTimeout extends Error {}

/**
 * Decodes through either calling convention: older WebKit answers only through
 * callbacks and returns nothing, current browsers return a promise. Gives up
 * with `DecodeTimeout` after `DECODE_TIMEOUT_MS`.
 */
function decodeWith(context: DecodingContext, bytes: ArrayBuffer): Promise<AudioBuffer> {
  return new Promise<AudioBuffer>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new DecodeTimeout('The decoder did not answer.'));
    }, DECODE_TIMEOUT_MS);
    const done = (buffer: AudioBuffer) => {
      clearTimeout(timer);
      resolve(buffer);
    };
    const failed = (error: unknown) => {
      clearTimeout(timer);
      reject(error instanceof Error ? error : new Error(String(error)));
    };
    try {
      const returned: unknown = context.decodeAudioData(bytes, done, failed);
      if (returned instanceof Promise) {
        (returned as Promise<AudioBuffer>).then(done, failed);
      }
    } catch (error) {
      failed(error);
    }
  });
}

interface ContextConstructors {
  readonly offline: DecodingContextConstructor | null;
  readonly live: DecodingContextConstructor | null;
}

function constructorOf(view: Window, ...names: string[]): DecodingContextConstructor | null {
  for (const name of names) {
    const candidate: unknown = Reflect.get(view, name);
    if (typeof candidate === 'function') {
      return candidate as DecodingContextConstructor;
    }
  }
  return null;
}

function contextConstructors(view: Window): ContextConstructors {
  return {
    offline: constructorOf(view, 'OfflineAudioContext', 'webkitOfflineAudioContext'),
    live: constructorOf(view, 'AudioContext', 'webkitAudioContext'),
  };
}

/** A context to decode with, or null when this browser cannot make one. */
function openContext(view: Window): DecodingContext | null {
  const { offline, live } = contextConstructors(view);
  // The sample rate is only what a decoded clip is resampled to; its length
  // in seconds, all that is read here, is the same at any rate.
  const attempts: readonly (() => DecodingContext | null)[] = [
    () => (offline === null ? null : new offline(1, 1, 44_100)),
    () => (live === null ? null : new live()),
  ];
  for (const attempt of attempts) {
    try {
      const context = attempt();
      if (context !== null) {
        return context;
      }
    } catch {
      // Refused: try the next kind.
    }
  }
  return null;
}
