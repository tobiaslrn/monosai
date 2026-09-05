import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/** SHA-256 of a byte buffer, lowercase hex. Matches the runtime `Hasher` port. */
export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function sha256File(path) {
  return sha256(await readFile(path));
}

export async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

/**
 * Writes a deterministic artifact: LF newlines, no trailing whitespace, and a
 * single trailing newline, so rebuilding an unchanged dataset produces an
 * identical file and an identical hash.
 */
export async function writeArtifact(path, text) {
  await mkdir(dirname(path), { recursive: true });
  const normalized = `${text.replace(/\r\n?/g, '\n').replace(/\n+$/, '')}\n`;
  await writeFile(path, normalized, 'utf8');
  return {
    bytes: Buffer.byteLength(normalized, 'utf8'),
    sha256: sha256(Buffer.from(normalized, 'utf8')),
  };
}
