import type { AudioDecoder, DecodeOutcome } from '../../domain/audio/audio-decoder';

export type { AudioDecoder, DecodeOutcome };

type DecodingContextConstructor = new (
  ...args: number[]
) => BaseAudioContext & { close?: () => Promise<void> };

/**
 * Decoder backed by the browser's own audio pipeline.
 *
 * An offline context renders nothing and holds no audio device, so the engine
 * cap on open contexts, which can refuse a live one for the rest of a session,
 * does not apply to it. A live context is the fallback for a browser without
 * one.
 *
 * `decodeAudioData` detaches the buffer it is given, so it always receives a
 * copy: the verified clip has to survive for the learner to play it.
 */
export function createAudioDecoder(view: Window): AudioDecoder {
  return {
    decode: async (bytes: ArrayBuffer): Promise<DecodeOutcome> => {
      const context = openContext(view);
      if (context === null) {
        return { kind: 'no-decoder' };
      }
      try {
        const buffer = await context.decodeAudioData(bytes.slice(0));
        return { kind: 'decoded', durationSeconds: buffer.duration };
      } catch {
        return { kind: 'undecodable' };
      } finally {
        await context.close?.();
      }
    },
  };
}

/** A context to decode with, or null when this browser cannot make one. */
function openContext(view: Window): (BaseAudioContext & { close?: () => Promise<void> }) | null {
  const offline: unknown = Reflect.get(view, 'OfflineAudioContext');
  const live: unknown =
    Reflect.get(view, 'AudioContext') ?? Reflect.get(view, 'webkitAudioContext');
  // The sample rate is only what a decoded clip is resampled to; its length
  // in seconds, all that is read here, is the same at any rate.
  const attempts: readonly (() => unknown)[] = [
    () =>
      typeof offline === 'function'
        ? new (offline as DecodingContextConstructor)(1, 1, 44_100)
        : null,
    () => (typeof live === 'function' ? new (live as DecodingContextConstructor)() : null),
  ];
  for (const attempt of attempts) {
    try {
      const context = attempt();
      if (context !== null) {
        return context as BaseAudioContext & { close?: () => Promise<void> };
      }
    } catch {
      // Refused: try the next kind.
    }
  }
  return null;
}
