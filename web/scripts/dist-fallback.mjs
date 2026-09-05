#!/usr/bin/env node
import { copyFile } from 'node:fs/promises';
import { join } from 'node:path';

const DIST_DIR = 'dist/monosai/browser';

/**
 * GitHub Pages serves `404.html` for any path it cannot resolve to a file.
 * Copying the app shell there makes a deep link work on the very first visit,
 * before the service worker exists to answer for it.
 *
 * This runs as part of the build rather than at deploy time so that the
 * verified, tested, and deployed artifacts are the same bytes.
 */
async function main() {
  const source = join(DIST_DIR, 'index.html');
  const fallback = join(DIST_DIR, '404.html');
  try {
    await copyFile(source, fallback);
  } catch (error) {
    process.stderr.write(`could not create ${fallback} from ${source}: ${String(error)}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`SPA fallback written: ${fallback}\n`);
}

await main();
