#!/usr/bin/env node
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from '../assets/lib/fs-json.mjs';
import {
  FAVICON_PATH,
  ICON_BACKGROUND,
  ICON_SOURCE_PATH,
  ICON_TARGETS,
  ICONS_OUTPUT_DIR,
  MASKABLE_LIFT,
  MASKABLE_SCALE,
} from './lib/layout.mjs';

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
 * Runs in the page: paints the background, then the mascot at `scale` of the
 * canvas, centred and raised `lift` above the bottom edge. The mascot's bottom
 * row is stretched down to the edge so its body still leaves the canvas.
 */
async function drawIcon(canvas, { sourceUrl, background, scale, lift }) {
  const image = new Image();
  image.src = sourceUrl;
  await image.decode();
  const size = canvas.width;
  const width = size * scale;
  const x = (size - width) / 2;
  const y = size - width - size * lift;
  const bottom = y + width;
  const context = canvas.getContext('2d');
  context.imageSmoothingQuality = 'high';
  context.fillStyle = background;
  context.fillRect(0, 0, size, size);
  const { naturalWidth, naturalHeight } = image;
  context.drawImage(
    image,
    0,
    naturalHeight - 1,
    naturalWidth,
    1,
    x,
    bottom - 1,
    width,
    size - bottom + 1,
  );
  context.drawImage(image, x, y, width, width);
}

/**
 * Composes the committed transparent mascot onto the brand background for
 * every icon the manifest declares, using the Chromium already installed for
 * Playwright rather than adding an image-processing dependency. Each target
 * is rendered as a page sized exactly to its target dimensions and
 * screenshotted, so the output pixel size is exact by construction.
 */
async function main() {
  const sourcePng = await readFile(ICON_SOURCE_PATH);
  const sourceUrl = `data:image/png;base64,${sourcePng.toString('base64')}`;
  await mkdir(ICONS_OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    for (const target of ICON_TARGETS) {
      const maskable = target.variant === 'maskable';
      await page.setViewportSize({ width: target.size, height: target.size });
      await page.setContent(
        `<!doctype html><html><head><style>html,body{margin:0;overflow:hidden;}canvas{display:block;}</style></head>
        <body><canvas width="${target.size}" height="${target.size}"></canvas></body></html>`,
      );
      await page.locator('canvas').evaluate(drawIcon, {
        sourceUrl,
        background: ICON_BACKGROUND,
        scale: maskable ? MASKABLE_SCALE : 1,
        lift: maskable ? MASKABLE_LIFT : 0,
      });
      const buffer = await page.screenshot({
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
    sourceSha256: sha256(sourcePng),
    icons: ICON_TARGETS.map((t) => ({ file: t.file, size: t.size, purpose: t.purpose })),
  };
  await writeFile(LOCK_PATH, `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
  process.stdout.write(`wrote ${LOCK_PATH}\n`);
}

await main();
