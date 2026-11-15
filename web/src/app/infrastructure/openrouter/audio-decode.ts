import type { AudioDecoder, DecodedClip } from '../../domain/audio/audio-decoder';

export type { AudioDecoder, DecodedClip };

type AudioContextConstructor = new (
  contextOptions?: AudioContextOptions,
) => BaseAudioContext & { close?: () => Promise<void> };

/**
 * Decoder backed by the browser's own audio pipeline.
 *
 * `decodeAudioData` detaches the buffer it is given, so it always receives a
 * copy: the verified clip has to survive for the learner to play it.
 */
export function createAudioDecoder(view: Window): AudioDecoder {
  return {
    decode: async (bytes: ArrayBuffer): Promise<DecodedClip | null> => {
      const candidate: unknown =
        Reflect.get(view, 'AudioContext') ?? Reflect.get(view, 'webkitAudioContext');
      if (typeof candidate !== 'function') {
        return null;
      }
      const Constructor = candidate as AudioContextConstructor;
      const context = new Constructor();
      try {
        const buffer = await context.decodeAudioData(bytes.slice(0));
        return { durationSeconds: buffer.duration };
      } catch {
        return null;
      } finally {
        await context.close?.();
      }
    },
  };
}
