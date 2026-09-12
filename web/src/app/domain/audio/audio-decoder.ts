/**
 * Proves a clip is playable in this browser, not merely non-empty.
 *
 * A provider can return a well-formed file this browser cannot decode, and so
 * can an encoder with a bug in it; the only honest way to tell is to decode it.
 * Kept behind an interface so tests do not need a real audio stack and so the
 * one place that touches Web Audio stays replaceable.
 */
export interface AudioDecoder {
  canDecode(bytes: ArrayBuffer, mimeType: string): Promise<boolean>;
}
