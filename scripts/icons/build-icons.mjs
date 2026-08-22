#!/usr/bin/env node
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { composeIconSvg } from './lib/compose-svg.mjs';
import { sha256 } from '../assets/lib/fs-json.mjs';
import { FAVICON_PATH, ICON_TARGETS, ICONS_OUTPUT_DIR, MARK_SOURCE_PATH } from './lib/layout.mjs';

const LOCK_PATH = join(dirname(fileURLToPath(import.meta.url)), 'icons.lock.json');

function createIco(png, size) {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header.writeUInt8(size === 256 ? 0 : size, 6);
  header.writeUInt8(size === 256 ? 0 : size, 7);
  header.writeUInt8(0, 8);
  header.writeUInt8(0, 9);
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(header.length, 18);
  return Buffer.concat([header, png]);
}

/**
 * Rasterises the committed brand mark into every icon the manifest declares,
 * using the Chromium already installed for Playwright rather than adding an
 * image-processing dependency. Each target is rendered as an SVG page sized
 * exactly to its target dimensions and screenshotted, so the output pixel
 * size is exact by construction.
 */
async function main() {
  const sourceSvg = await readFile(MARK_SOURCE_PATH, 'utf8');
  await mkdir(ICONS_OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    for (const target of ICON_TARGETS) {
      const svg = composeIconSvg(sourceSvg, target.variant);
      await page.setViewportSize({ width: target.size, height: target.size });
      await page.setContent(
        `<!doctype html><html><head><style>
          html,body{margin:0;padding:0;width:${target.size}px;height:${target.size}px;overflow:hidden;}
          svg{display:block;width:${target.size}px;height:${target.size}px;}
        </style></head><body>${svg}</body></html>`,
      );
      const buffer = await page.screenshot({
        omitBackground: target.variant !== 'apple',
        clip: { x: 0, y: 0, width: target.size, height: target.size },
      });
      await writeFile(join(ICONS_OUTPUT_DIR, target.file), buffer);
      process.stdout.write(
        `wrote ${target.file} (${target.size}x${target.size}, ${target.variant})\n`,
      );
    }
  } finally {
    await browser.close();
  }

  const favicon = await readFile(join(ICONS_OUTPUT_DIR, 'favicon-32.png'));
  await writeFile(FAVICON_PATH, createIco(favicon, 32));
  process.stdout.write('wrote public/favicon.ico (32x32 PNG payload)\n');

  const lock = {
    markSha256: sha256(Buffer.from(sourceSvg, 'utf8')),
    icons: ICON_TARGETS.map((t) => ({ file: t.file, size: t.size, purpose: t.purpose })),
  };
  await writeFile(LOCK_PATH, `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
  process.stdout.write(`wrote ${LOCK_PATH}\n`);
}

await main();
