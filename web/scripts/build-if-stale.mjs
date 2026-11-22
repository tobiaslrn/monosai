#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Runs `build:pages` only when something the build reads has changed, so a local
 * end-to-end run does not rebuild the application it just built. `--force`
 * rebuilds regardless, and so does deleting `dist`.
 *
 * The stamp also records the built `index.html`, so a build made by hand with
 * other options never counts as current. It sits outside `dist/monosai`, which
 * the build empties and the server exposes. Inputs are compared by size and
 * modification time: reading every language asset would cost more than it saves,
 * and a checkout that touches a file only causes a harmless rebuild.
 *
 * `--gallery` does the same for the gallery build the screenshot baselines are
 * taken of, which has its own output and stamp.
 */
const GALLERY = process.argv.includes('--gallery');
const STAMP = GALLERY ? 'dist/gallery-build-stamp.json' : 'dist/e2e-build-stamp.json';
const INDEX = GALLERY ? 'dist/gallery/browser/index.html' : 'dist/monosai/browser/index.html';
const BUILD = GALLERY ? 'npm run build:gallery' : 'npm run build:pages';
const INPUTS = [
  'src',
  'public',
  'angular.json',
  'bundle-budgets.json',
  'ngsw-config.json',
  'package-lock.json',
  'tsconfig.app.json',
  'tsconfig.json',
];

function digestInputs() {
  const hash = createHash('sha256');
  const add = (path) => {
    const info = statSync(path, { throwIfNoEntry: false });
    if (info?.isDirectory()) {
      for (const entry of readdirSync(path).sort()) {
        add(join(path, entry));
      }
    } else if (info !== undefined) {
      hash.update(`${path}\0${String(info.size)}\0${String(info.mtimeMs)}\n`);
    }
  };
  INPUTS.forEach(add);
  return hash.digest('hex');
}

function digestIndex() {
  try {
    return createHash('sha256').update(readFileSync(INDEX)).digest('hex');
  } catch {
    return null;
  }
}

function readStamp() {
  try {
    return JSON.parse(readFileSync(STAMP, 'utf8'));
  } catch {
    return null;
  }
}

const inputs = digestInputs();
const stamp = readStamp();
const index = digestIndex();
const current = index !== null && stamp?.inputs === inputs && stamp?.index === index;

if (current && !process.argv.includes('--force')) {
  process.stdout.write('build-if-stale: the build is current, skipping it\n');
} else {
  execSync(BUILD, { stdio: 'inherit' });
  mkdirSync(dirname(STAMP), { recursive: true });
  writeFileSync(STAMP, JSON.stringify({ inputs, index: digestIndex() }));
}
