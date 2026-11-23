import type { AudioDecoder, DecodeOutcome } from '../../domain/audio/audio-decoder';

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
 * with no context constructor answers no at once, and one whose constructors
 * all refused is remembered as having none for as long as this tab lives, so
 * no second clip is bought to find out again.
 *
 * `decodeAudioData` detaches the buffer it is given, so it always receives a
 * copy: the verified clip has to survive for the learner to play it.
 */
export function createAudioDecoder(view: Window): AudioDecoder {
  let missing = false;
  return {
    available: () => {
      const { offline, live } = contextConstructors(view);
      if (offline === null && live === null) {
        missing = true;
      }
      return !missing;
    },
    decode: async (bytes: ArrayBuffer): Promise<DecodeOutcome> => {
      const context = missing ? null : openContext(view);
      if (context === null) {
        missing = true;
        return { kind: 'no-decoder' };
      }
      try {
        const buffer = await decodeWith(context, bytes.slice(0));
        return { kind: 'decoded', durationSeconds: buffer.duration };
      } catch {
        return { kind: 'undecodable' };
      } finally {
        await context.close?.();
      }
    },
  };
}

/**
 * Decodes through either calling convention: older WebKit answers only through
 * callbacks and returns nothing, current browsers return a promise.
 */
function decodeWith(context: DecodingContext, bytes: ArrayBuffer): Promise<AudioBuffer> {
  return new Promise<AudioBuffer>((resolve, reject) => {
    const returned: unknown = context.decodeAudioData(bytes, resolve, reject);
    if (returned instanceof Promise) {
      (returned as Promise<AudioBuffer>).then(resolve, reject);
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
