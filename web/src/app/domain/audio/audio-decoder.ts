/** What decoding a clip proved about it. */
export interface DecodedClip {
  readonly durationSeconds: number;
}

/**
 * What one attempt to decode a clip found.
 *
 * `undecodable` is about the clip: these bytes do not decode, and another
 * clip may. `no-decoder` is about the browser: it has nothing to decode with,
 * so no clip will decode in this tab, and asking for another would only be
 * paid for and thrown away.
 */
export type DecodeOutcome =
  | ({ readonly kind: 'decoded' } & DecodedClip)
  | { readonly kind: 'undecodable' }
  | { readonly kind: 'no-decoder' };

/**
 * The issue code of a speech failure caused by a browser that cannot decode
 * audio at all, shared by the adapter that reports it and the copy that tells
 * the learner.
 */
export const NO_AUDIO_DECODER = 'no-audio-decoder';

/**
 * Proves a clip is playable in this browser, not merely non-empty.
 *
 * A provider can return a well-formed file this browser cannot decode, and so
 * can an encoder with a bug in it; the only honest way to tell is to decode it.
 * Decoding also yields the clip's length, which is how a speech test tells a
 * model that read the sentence from one that read something else as well.
 * Kept behind an interface so tests do not need a real audio stack and so the
 * one place that touches Web Audio stays replaceable.
 */
export interface AudioDecoder {
  /**
   * Whether this browser is known to be able to decode, without asking it
   * anything. Once it has said no, it says no for the rest of the tab's life.
   */
  available(): boolean;
  /**
   * Whether this browser can decode at all, asked before a clip is paid for:
   * it decodes a tiny built-in clip once per tab, so a browser that makes a
   * context but decodes nothing is found out before a clip is bought, not
   * after. Afterwards `available` gives the same answer. A check whose decode
   * never answered says no without being remembered, and the next one asks
   * again.
   */
  canDecode(): Promise<boolean>;
  decode(bytes: ArrayBuffer, mimeType: string): Promise<DecodeOutcome>;
}
