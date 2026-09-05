#!/usr/bin/env node
/**
 * Builds the synthetic Anki package fixtures.
 *
 * The fixtures are committed rather than generated during the test run because
 * two of the formats cannot be produced in a browser: zstd has no compressor in
 * `fzstd` or in `CompressionStream`, and `node:sqlite` does not exist in the
 * test bundle. Building them here keeps them reproducible — running this script
 * twice must produce byte-identical files — while the tests stay free of any
 * Node-only dependency.
 *
 * Personal collections are never used. Every fixture is synthetic and
 * license-safe, per the testing specification.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zstdCompressSync } from 'node:zlib';
import {
  CONTRACT_COLLECTION,
  FILTERED_DECK_COLLECTION,
  NESTED_DECK_COLLECTION,
  NO_REVIEW_EVIDENCE_COLLECTION,
} from './anki-collection.mjs';
import {
  buildLegacyStub,
  buildSchema11,
  buildSchema18,
  buildWithoutRepsColumn,
} from './lib/collection-builder.mjs';
import { DEFLATE, STORED, writeZip } from './lib/zip-writer.mjs';

const OUTPUT_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'src',
  'testing',
  'fixtures',
  'anki',
);

/** `meta` is a protobuf holding one field: the package version. */
function metaFor(version) {
  return Buffer.from([0x08, version]);
}

const EMPTY_MEDIA = Buffer.from('{}', 'utf8');

/** A current Anki export: zstd-compressed collection plus a legacy stub. */
function modernPackage(collection) {
  return writeZip([
    { name: 'meta', data: metaFor(3), method: STORED },
    {
      name: 'collection.anki21b',
      data: zstdCompressSync(buildSchema18(collection)),
      method: STORED,
    },
    { name: 'collection.anki2', data: buildLegacyStub(), method: STORED },
    { name: 'media', data: EMPTY_MEDIA, method: STORED },
    // Media members exist so the reader can prove it lists without reading them.
    { name: '0', data: Buffer.from('not-a-real-image'), method: STORED },
    { name: '1', data: Buffer.from('not-a-real-sound'), method: STORED },
  ]);
}

/** An export made with legacy support, which writes an uncompressed collection. */
function legacySupportPackage(collection) {
  return writeZip([
    { name: 'meta', data: metaFor(2), method: STORED },
    { name: 'collection.anki21', data: buildSchema18(collection), method: DEFLATE },
    { name: 'collection.anki2', data: buildLegacyStub(), method: DEFLATE },
    { name: 'media', data: EMPTY_MEDIA, method: STORED },
  ]);
}

/** An export from an Anki old enough to predate the `meta` member entirely. */
function ancientPackage(collection) {
  return writeZip([
    { name: 'collection.anki2', data: buildSchema11(collection), method: DEFLATE },
    { name: 'media', data: EMPTY_MEDIA, method: STORED },
  ]);
}

const FIXTURES = {
  'contract-schema18-zstd.apkg': () => modernPackage(CONTRACT_COLLECTION),
  'contract-schema18-deflate.apkg': () => legacySupportPackage(CONTRACT_COLLECTION),
  'contract-schema11.apkg': () => ancientPackage(CONTRACT_COLLECTION),
  'contract-schema18-zstd.colpkg': () => modernPackage(CONTRACT_COLLECTION),
  'no-review-evidence.apkg': () => modernPackage(NO_REVIEW_EVIDENCE_COLLECTION),
  'filtered-deck.apkg': () => modernPackage(FILTERED_DECK_COLLECTION),
  'nested-decks.apkg': () => modernPackage(NESTED_DECK_COLLECTION),

  'missing-reps-column.apkg': () =>
    writeZip([
      { name: 'meta', data: metaFor(3), method: STORED },
      {
        name: 'collection.anki21b',
        data: zstdCompressSync(buildWithoutRepsColumn(CONTRACT_COLLECTION)),
        method: STORED,
      },
      { name: 'media', data: EMPTY_MEDIA, method: STORED },
    ]),

  'no-collection.apkg': () =>
    writeZip([
      { name: 'meta', data: metaFor(3), method: STORED },
      { name: 'media', data: EMPTY_MEDIA, method: STORED },
      { name: '0', data: Buffer.from('only-media-here'), method: STORED },
    ]),

  'not-a-database.apkg': () =>
    writeZip([
      { name: 'meta', data: metaFor(2), method: STORED },
      {
        name: 'collection.anki21',
        data: Buffer.from('this is plainly not sqlite'),
        method: STORED,
      },
    ]),

  // Compression method 12 is bzip2, which no browser can inflate.
  'unsupported-compression.apkg': () =>
    writeZip([
      { name: 'meta', data: metaFor(2), method: STORED },
      { name: 'collection.anki21', data: Buffer.from('bzip2 payload'), method: 12 },
    ]),

  'unsafe-path.apkg': () =>
    writeZip([
      { name: 'meta', data: metaFor(2), method: STORED },
      { name: '../escaped.txt', data: Buffer.from('nope'), method: STORED },
    ]),

  'encrypted.apkg': () =>
    writeZip([
      { name: 'meta', data: metaFor(2), method: STORED },
      { name: 'collection.anki21', data: Buffer.from('encrypted'), method: STORED, flags: 0x0001 },
    ]),

  // Declares a gigabyte of output from a handful of bytes.
  'decompression-bomb.apkg': () =>
    writeZip([
      { name: 'meta', data: metaFor(2), method: STORED },
      {
        name: 'collection.anki21',
        data: Buffer.alloc(64),
        method: DEFLATE,
        declaredUncompressedSize: 1024 * 1024 * 1024,
      },
    ]),

  'truncated.apkg': () => Buffer.from('PK'),
};

/**
 * `--check` rebuilds everything and fails if a committed fixture differs, which
 * is what keeps the committed bytes reproducible from this script rather than
 * from whoever happened to run it last.
 */
function main() {
  const checkOnly = process.argv.includes('--check');
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const manifest = {};
  const drifted = [];

  for (const [name, build] of Object.entries(FIXTURES)) {
    const bytes = build();
    const path = join(OUTPUT_DIR, name);
    let unchanged = false;
    try {
      unchanged = readFileSync(path).equals(bytes);
    } catch {
      unchanged = false;
    }
    manifest[name] = bytes.length;

    if (unchanged) {
      continue;
    }
    if (checkOnly) {
      drifted.push(name);
      continue;
    }
    writeFileSync(path, bytes);
    console.log(`wrote  ${name}  ${String(bytes.length)} bytes`);
  }

  const sizesPath = join(OUTPUT_DIR, 'sizes.json');
  const sizes = `${JSON.stringify(manifest, null, 2)}\n`;

  if (!checkOnly) {
    writeFileSync(sizesPath, sizes);
    return;
  }

  let committedSizes = '';
  try {
    committedSizes = readFileSync(sizesPath, 'utf8');
  } catch {
    committedSizes = '';
  }
  if (committedSizes !== sizes) {
    drifted.push('sizes.json');
  }
  if (drifted.length > 0) {
    console.error(
      `Anki fixtures are out of date: ${drifted.join(', ')}. Run npm run fixtures:build.`,
    );
    process.exitCode = 1;
    return;
  }
  console.log(`${String(Object.keys(FIXTURES).length)} Anki fixtures match their sources.`);
}

main();
