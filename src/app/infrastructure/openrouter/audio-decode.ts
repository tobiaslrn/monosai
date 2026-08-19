/**
 * Proves a clip is playable in this browser, not merely non-empty.
 *
 * A provider can return a well-formed file this browser cannot decode, and the
 * only honest way to tell is to decode it. Kept behind an interface so tests do
 * not need a real audio stack and so the one place that touches Web Audio stays
 * replaceable.
 */
export interface AudioDecoder {
  canDecode(bytes: ArrayBuffer, mimeType: string): Promise<boolean>;
}

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
    canDecode: async (bytes: ArrayBuffer): Promise<boolean> => {
      const candidate: unknown =
        Reflect.get(view, 'AudioContext') ?? Reflect.get(view, 'webkitAudioContext');
      if (typeof candidate !== 'function') {
        return false;
      }
      const Constructor = candidate as AudioContextConstructor;
      const context = new Constructor();
      try {
        await context.decodeAudioData(bytes.slice(0));
        return true;
      } catch {
        return false;
      } finally {
        await context.close?.();
      }
    },
  };
}
