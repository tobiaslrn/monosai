import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';

const BLOCK_SIZE = 512;
const NAME = { offset: 0, length: 100 };
const SIZE = { offset: 124, length: 12 };
const TYPE_FLAG = 156;
const PREFIX = { offset: 345, length: 155 };

function readString(block, { offset, length }) {
  const raw = block.subarray(offset, offset + length);
  const end = raw.indexOf(0);
  return raw.subarray(0, end === -1 ? raw.length : end).toString('utf8');
}

function readOctal(block, field) {
  const text = readString(block, field).trim();
  return text.length === 0 ? 0 : Number.parseInt(text, 8);
}

/**
 * Minimal reader for the single-file gzipped tarballs published by the pinned
 * upstream releases. Only regular files are returned; anything else (symlinks,
 * device nodes, absolute or traversing paths) is rejected so a malicious archive
 * cannot influence the build.
 */
export async function readGzippedTarEntries(path) {
  const buffer = gunzipSync(await readFile(path));
  const entries = new Map();
  let cursor = 0;
  while (cursor + BLOCK_SIZE <= buffer.length) {
    const header = buffer.subarray(cursor, cursor + BLOCK_SIZE);
    if (header.every((byte) => byte === 0)) {
      break;
    }
    const name = readString(header, NAME);
    const prefix = readString(header, PREFIX);
    const fullName = prefix.length > 0 ? `${prefix}/${name}` : name;
    const size = readOctal(header, SIZE);
    const typeFlag = String.fromCharCode(header[TYPE_FLAG]);
    cursor += BLOCK_SIZE;
    if (typeFlag === '0' || typeFlag === '\0') {
      if (fullName.startsWith('/') || fullName.split('/').includes('..')) {
        throw new Error(`Refusing unsafe archive member path: ${fullName}`);
      }
      entries.set(fullName, buffer.subarray(cursor, cursor + size));
    } else if (typeFlag !== '5' && typeFlag !== 'x' && typeFlag !== 'g') {
      throw new Error(`Unsupported archive member type '${typeFlag}' for ${fullName}`);
    }
    cursor += Math.ceil(size / BLOCK_SIZE) * BLOCK_SIZE;
  }
  return entries;
}

/** Returns the only member whose name matches `pattern`, failing when ambiguous. */
export function singleEntry(entries, pattern) {
  const matches = [...entries.entries()].filter(([name]) => pattern.test(name));
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one archive member matching ${String(pattern)}, found ${matches.length}`,
    );
  }
  return matches[0][1];
}
