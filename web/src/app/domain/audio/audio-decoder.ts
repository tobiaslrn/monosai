/** What decoding a clip proved about it. */
export interface DecodedClip {
  readonly durationSeconds: number;
}

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
  /** The decoded clip, or `null` when this browser cannot decode it. */
  decode(bytes: ArrayBuffer, mimeType: string): Promise<DecodedClip | null>;
}
