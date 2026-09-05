import { createWriteStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { get } from 'node:https';
import { pipeline } from 'node:stream/promises';
import { sha256File } from './fs-json.mjs';

const MAX_REDIRECTS = 5;

function fetchToFile(url, path, redirectsLeft) {
  return new Promise((resolve, reject) => {
    const request = get(url, { headers: { 'user-agent': 'monosai-asset-build' } }, (response) => {
      const location = response.headers.location;
      if (response.statusCode !== undefined && response.statusCode >= 300 && location) {
        response.resume();
        if (redirectsLeft === 0) {
          reject(new Error(`Too many redirects for ${url}`));
          return;
        }
        fetchToFile(new URL(location, url).toString(), path, redirectsLeft - 1).then(
          resolve,
          reject,
        );
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`GET ${url} failed with status ${response.statusCode}`));
        return;
      }
      pipeline(response, createWriteStream(path)).then(resolve, reject);
    });
    request.on('error', reject);
    request.setTimeout(120_000, () => {
      request.destroy(new Error(`GET ${url} timed out`));
    });
  });
}

/**
 * Downloads a pinned upstream source into the local build cache and verifies it
 * against the recorded digest. An already-cached file with the expected digest
 * makes the build offline-repeatable.
 */
export async function downloadPinned({ url, path, sha256: expected }) {
  const cached = await stat(path).catch(() => null);
  if (cached === null) {
    await mkdir(dirname(path), { recursive: true });
    process.stdout.write(`downloading ${url}\n`);
    await fetchToFile(url, path, MAX_REDIRECTS);
  }
  const actual = await sha256File(path);
  if (expected !== undefined && actual !== expected) {
    throw new Error(
      `Pinned source digest mismatch for ${url}\n  expected ${expected}\n  actual   ${actual}`,
    );
  }
  return { path, sha256: actual };
}
