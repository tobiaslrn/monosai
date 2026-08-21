#!/usr/bin/env node
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const DIST_DIR = 'dist/monosai/browser';
const BASE_PATH = '/monosai/';

const REQUIRED_FILES = [
  'index.html',
  'ngsw.json',
  'ngsw-worker.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon-180.png',
];

async function exists(path) {
  return (await stat(path).catch(() => null)) !== null;
}

/** Every href/src attribute value in an HTML document, crudely but sufficiently. */
function extractReferences(html) {
  const matches = html.matchAll(/\b(?:href|src)="([^"]+)"/g);
  return [...matches].map((match) => match[1]);
}

/**
 * Whether a reference is root-absolute in a way that would escape the base
 * path once served from `/monosai/` rather than `/` — the exact defect class
 * that breaks a Pages subpath deployment and is invisible at localhost:4200.
 */
function escapesBasePath(reference) {
  if (!reference.startsWith('/')) {
    return false;
  }
  if (reference.startsWith('//')) {
    // Protocol-relative URL to another origin, not a path.
    return false;
  }
  return !reference.startsWith(BASE_PATH);
}

async function resolvesToFile(reference) {
  if (/^[a-z]+:/i.test(reference) || reference.startsWith('//')) {
    // External or protocol-relative URL; nothing to check on disk.
    return true;
  }
  const withoutQuery = reference.split(/[?#]/)[0];
  const relative = withoutQuery.startsWith(BASE_PATH)
    ? withoutQuery.slice(BASE_PATH.length)
    : withoutQuery.replace(/^\//, '');
  return exists(join(DIST_DIR, relative));
}

async function main() {
  const failures = [];

  for (const file of REQUIRED_FILES) {
    if (!(await exists(join(DIST_DIR, file)))) {
      failures.push(`missing required file: ${file}`);
    }
  }

  const indexHtml = await readFile(join(DIST_DIR, 'index.html'), 'utf8').catch(() => null);
  if (indexHtml === null) {
    failures.push(`could not read ${join(DIST_DIR, 'index.html')}`);
  } else {
    const baseHrefMatch = indexHtml.match(/<base\s+href="([^"]*)"/);
    if (baseHrefMatch?.[1] !== BASE_PATH) {
      failures.push(
        `index.html <base href> is ${baseHrefMatch?.[1] ?? '(missing)'}, expected ${BASE_PATH}`,
      );
    }

    for (const reference of extractReferences(indexHtml)) {
      if (escapesBasePath(reference)) {
        failures.push(
          `index.html references ${reference}, which escapes the ${BASE_PATH} base path`,
        );
        continue;
      }
      if (!(await resolvesToFile(reference))) {
        failures.push(
          `index.html references ${reference}, which does not resolve to an emitted file`,
        );
      }
    }
  }

  const manifestJson = await readFile(join(DIST_DIR, 'manifest.webmanifest'), 'utf8').catch(
    () => null,
  );
  if (manifestJson === null) {
    failures.push('manifest.webmanifest is missing, cannot verify its icons');
  } else {
    let manifest;
    try {
      manifest = JSON.parse(manifestJson);
    } catch (error) {
      failures.push(`manifest.webmanifest does not parse as JSON: ${String(error)}`);
      manifest = null;
    }
    if (manifest !== null) {
      for (const icon of manifest.icons ?? []) {
        if (!(await exists(join(DIST_DIR, icon.src)))) {
          failures.push(`manifest icon ${icon.src} does not resolve to an emitted file`);
        }
      }
    }
  }

  if (failures.length > 0) {
    process.stderr.write(`dist verification failed:\n- ${failures.join('\n- ')}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `dist verified: base path ${BASE_PATH}, PWA assets present and resolvable\n`,
  );
}

await main();
