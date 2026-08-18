import { sha256Bytes } from '../hashing/sha256';

function toHex(bytes: Uint8Array): string {
  let hex = '';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * SHA-256 of raw bytes, matching the digests recorded by the asset build.
 *
 * WebCrypto is used when the context allows it, because hashing a multi-megabyte
 * tokenizer runtime in JavaScript would add noticeable time to initialization.
 * The synchronous implementation stays as the fallback so integrity checks still
 * work on insecure origins, where `crypto.subtle` is unavailable.
 */
export async function digestHex(bytes: Uint8Array): Promise<string> {
  const subtle: SubtleCrypto | undefined = (globalThis as { crypto?: Crypto }).crypto?.subtle;
  if (subtle !== undefined) {
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    return toHex(new Uint8Array(await subtle.digest('SHA-256', buffer)));
  }
  return toHex(sha256Bytes(bytes));
}
