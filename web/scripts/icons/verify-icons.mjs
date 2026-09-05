#!/usr/bin/env node
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { sha256 } from '../assets/lib/fs-json.mjs';
import { FAVICON_PATH, ICON_TARGETS, ICONS_OUTPUT_DIR, MARK_SOURCE_PATH } from './lib/layout.mjs';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MIN_BYTES = 200;
const LOCK_PATH = new URL('./icons.lock.json', import.meta.url);

/** Reads width/height straight out of the PNG IHDR chunk. No image dependency needed. */
function readPngDimensions(buffer) {
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return null;
  }
  const chunkType = buffer.toString('ascii', 12, 16);
  if (chunkType !== 'IHDR') {
    return null;
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function readIcoPng(buffer) {
  if (buffer.length < 22 || buffer.readUInt16LE(0) !== 0 || buffer.readUInt16LE(2) !== 1) {
    return null;
  }
  const count = buffer.readUInt16LE(4);
  if (count < 1) {
    return null;
  }
  const size = buffer.readUInt32LE(14);
  const offset = buffer.readUInt32LE(18);
  if (offset + size > buffer.length) {
    return null;
  }
  return buffer.subarray(offset, offset + size);
}

/**
 * Structural verification of the generated icons, not byte equality.
 * Chromium's PNG encoder is not byte-identical across platforms and
 * versions, so a byte-equality check would fail in CI on Linux against icons
 * generated on Windows. Instead this asserts: every declared file exists, is
 * a real PNG, has exactly the declared pixel dimensions, is non-trivially
 * sized, and that the committed source SVG has not drifted from what was
 * last built (its digest is recorded in icons.lock.json by build-icons.mjs).
 */
async function main() {
  const failures = [];

  const sourceSvg = await readFile(MARK_SOURCE_PATH, 'utf8');
  const lock = JSON.parse(await readFile(LOCK_PATH, 'utf8').catch(() => 'null'));
  if (lock === null) {
    failures.push('scripts/icons/icons.lock.json is missing; run npm run icons:build');
  } else if (sha256(Buffer.from(sourceSvg, 'utf8')) !== lock.markSha256) {
    failures.push(
      'data/brand/monosai-mark.svg has changed since icons were last built; run npm run icons:build',
    );
  }

  for (const target of ICON_TARGETS) {
    const path = join(ICONS_OUTPUT_DIR, target.file);
    const bytes = await readFile(path).catch(() => null);
    if (bytes === null) {
      failures.push(`${target.file} is missing at ${path}`);
      continue;
    }
    const info = await stat(path);
    if (info.size < MIN_BYTES) {
      failures.push(`${target.file} is only ${info.size} bytes, suspiciously small`);
    }
    const dims = readPngDimensions(bytes);
    if (dims === null) {
      failures.push(`${target.file} does not start with a valid PNG signature/IHDR chunk`);
      continue;
    }
    if (dims.width !== target.size || dims.height !== target.size) {
      failures.push(
        `${target.file} is ${dims.width}x${dims.height}, expected ${target.size}x${target.size}`,
      );
    }
  }

  const favicon = await readFile(FAVICON_PATH).catch(() => null);
  if (favicon === null) {
    failures.push('public/favicon.ico is missing; run npm run icons:build');
  } else {
    const faviconPng = readIcoPng(favicon);
    const dims = faviconPng === null ? null : readPngDimensions(faviconPng);
    if (dims?.width !== 32 || dims.height !== 32) {
      failures.push('public/favicon.ico does not contain a valid 32x32 PNG payload');
    }
  }

  if (failures.length > 0) {
    process.stderr.write(`icon verification failed:\n- ${failures.join('\n- ')}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`icons verified (${ICON_TARGETS.length} files)\n`);
}

await main();
