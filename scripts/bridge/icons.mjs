import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

/*
 * The bridge wears the Monosai mascot with a bridge badge, so a launcher never
 * offers two identical Monosai icons. The badge is composed here rather than
 * layered in Android XML because the monochrome themed icon carries alpha and
 * no colour: separating the badge from the mascot there needs a genuine hole
 * punched in the silhouette, which no layer drawn on top can produce.
 *
 * Without arguments this renders and writes every resource. `--check` is the
 * pure-Node verification CI runs: it never opens a browser, and instead checks
 * that the committed bitmaps are real PNGs of the declared size and that
 * neither the mascot nor the composition below has moved since they were
 * built. Chromium's PNG encoder is not byte-identical across platforms, so
 * byte equality would fail in CI against bitmaps built on another machine.
 */

const mascotPath = 'web/data/brand/monosai-icon.png';
const res = 'android-bridge/app/src/main/res';
const lockPath = 'scripts/bridge/icons.lock.json';
const check = process.argv.includes('--check');

/** The mascot is flattened onto `--action-primary`; the badge is paper and deep sage. */
const BACKGROUND = '#347e55';
const PAPER = '#f8f6f1';
const INK = '#2b6947';

/**
 * Geometry as fractions of the 108dp adaptive-icon canvas. A launcher shows
 * only the centred 72dp of it, so everything that must survive every mask
 * stays inside radius 0.333 of the centre.
 *
 * The mascot is anchored to the bottom edge at `mascot`, which puts its marks
 * at radius 0.303 and leaves its body running out of the visible window the
 * way the unmasked app icon does. The badge's disc reaches radius 0.307, and
 * its `gap` — the background showing between badge and mascot — is the only
 * part allowed to graze the window's edge.
 */
const ICON = {
  size: 512,
  mascot: 0.7,
  badgeOffset: 0.138,
  badgeRadius: 0.112,
  gap: 0.018,
  glyphScale: 0.8,
};

/**
 * The badge mark: a suspension bridge in a 24-unit box. Two towers, a deck,
 * two abutment posts, and one main cable. It is the one glyph of the four
 * drawn that still reads as a bridge rather than as a letter or a tunnel at
 * launcher size, and it is the same geometry the notification icon uses.
 */
const GLYPH = {
  rects: [
    [2.8, 14.0, 18.4, 2.7, 1.35],
    [6.6, 4.6, 2.4, 9.8, 1.2],
    [15.0, 4.6, 2.4, 9.8, 1.2],
    [4.2, 16.7, 2.1, 3.4, 1.0],
    [17.7, 16.7, 2.1, 3.4, 1.0],
  ],
  cable: { d: 'M3.4 9.6 L7.8 5.6 Q12 13.0 16.2 5.6 L20.6 9.6', width: 2.0 },
};

const bitmaps = [
  { file: 'drawable-nodpi/bridge_foreground.png', mono: false },
  { file: 'drawable-nodpi/bridge_monochrome.png', mono: true },
];

const round = (value) => Number(value.toFixed(3));

/** Rounded rectangle as SVG path data, so the badge and the status icon share one geometry. */
function roundedRectPath([x, y, w, h, r]) {
  const a = (rx, ry) => `a${round(r)},${round(r)} 0 0 1 ${round(rx)},${round(ry)}`;
  return [
    `M${round(x + r)},${round(y)}`,
    `h${round(w - 2 * r)}`,
    a(r, r),
    `v${round(h - 2 * r)}`,
    a(-r, r),
    `h${round(-(w - 2 * r))}`,
    a(-r, -r),
    `v${round(-(h - 2 * r))}`,
    a(r, -r),
    'z',
  ].join(' ');
}

const glyphFillPath = GLYPH.rects.map(roundedRectPath).join(' ');

/**
 * Runs in the page. Colour paints the badge over the mascot and its glyph onto
 * the disc; monochrome cuts both the gap and the glyph out of the silhouette,
 * because a themed icon is alpha only.
 */
async function drawBridgeIcon(canvas, options) {
  const { sourceUrl, mono, background, paper, ink, icon, glyph } = options;
  const image = new Image();
  image.src = sourceUrl;
  await image.decode();
  const s = canvas.width;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, s, s);

  if (!mono) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, s, s);
  }

  const width = s * icon.mascot;
  ctx.drawImage(image, (s - width) / 2, s - width, width, width);
  if (mono) {
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, s, s);
    ctx.globalCompositeOperation = 'source-over';
  }

  const cx = s * (0.5 + icon.badgeOffset);
  const cy = s * (0.5 - icon.badgeOffset);
  const disc = (radius) => {
    ctx.beginPath();
    ctx.arc(cx, cy, s * radius, 0, Math.PI * 2);
    ctx.fill();
  };

  if (mono) {
    ctx.globalCompositeOperation = 'destination-out';
    disc(icon.badgeRadius + icon.gap);
    ctx.globalCompositeOperation = 'source-over';
  } else {
    ctx.fillStyle = background;
    disc(icon.badgeRadius + icon.gap);
  }
  ctx.fillStyle = mono ? '#ffffff' : paper;
  disc(icon.badgeRadius);

  const box = s * icon.badgeRadius * 2 * icon.glyphScale;
  ctx.save();
  ctx.translate(cx - box / 2, cy - box / 2);
  ctx.scale(box / 24, box / 24);
  if (mono) {
    ctx.globalCompositeOperation = 'destination-out';
  } else {
    ctx.fillStyle = ink;
    ctx.strokeStyle = ink;
  }
  ctx.fill(new Path2D(glyph.fill));
  ctx.lineWidth = glyph.cable.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke(new Path2D(glyph.cable.d));
  ctx.restore();
  ctx.globalCompositeOperation = 'source-over';
}

const android = 'xmlns:android="http://schemas.android.com/apk/res/android"';
const generated = '<!-- Generated by scripts/bridge/icons.mjs -->\n';

const files = new Map();
files.set(
  'drawable/bridge_status.xml',
  `${generated}<vector ${android}
    android:width="24dp" android:height="24dp"
    android:viewportWidth="24" android:viewportHeight="24">
    <path android:fillColor="#FFFFFFFF" android:pathData="${glyphFillPath}" />
    <path android:strokeColor="#FFFFFFFF" android:strokeWidth="${GLYPH.cable.width}"
        android:strokeLineCap="round" android:strokeLineJoin="round"
        android:pathData="${GLYPH.cable.d}" />
</vector>\n`,
);
files.set(
  'values/brand.xml',
  `<resources>\n    <color name="bridge_background">${BACKGROUND.toUpperCase()}</color>\n    <string name="app_name" translatable="false">Monosai Bridge</string>\n</resources>\n`,
);
files.set(
  'mipmap-anydpi-v26/ic_launcher.xml',
  `<adaptive-icon ${android}>\n    <background android:drawable="@color/bridge_background" />\n    <foreground android:drawable="@drawable/bridge_foreground" />\n    <monochrome android:drawable="@drawable/bridge_monochrome" />\n</adaptive-icon>\n`,
);

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MIN_BYTES = 200;

/** Width and height straight out of the PNG IHDR chunk; no image dependency needed. */
function readPngDimensions(buffer) {
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  if (buffer.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

const composition = JSON.stringify({
  background: BACKGROUND,
  paper: PAPER,
  ink: INK,
  icon: ICON,
  glyph: GLYPH,
  bitmaps: bitmaps.map((bitmap) => bitmap.file),
});

async function render(mascot) {
  // Playwright lives in the web workspace; the repository root has no install
  // of its own, which is why `npm run format` reaches into it the same way.
  const { chromium } = createRequire(`${process.cwd()}/web/package.json`)('@playwright/test');
  const sourceUrl = `data:image/png;base64,${mascot.toString('base64')}`;
  const executablePath = process.env['MONOSAI_CHROMIUM_EXECUTABLE'];
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  try {
    const page = await browser.newPage();
    for (const { file, mono } of bitmaps) {
      await page.setViewportSize({ width: ICON.size, height: ICON.size });
      await page.setContent(
        `<!doctype html><html><head><style>html,body{margin:0;overflow:hidden;}canvas{display:block;}</style></head>
        <body><canvas width="${ICON.size}" height="${ICON.size}"></canvas></body></html>`,
      );
      await page.locator('canvas').evaluate(drawBridgeIcon, {
        sourceUrl,
        mono,
        background: BACKGROUND,
        paper: PAPER,
        ink: INK,
        icon: ICON,
        glyph: { fill: glyphFillPath, cable: GLYPH.cable },
      });
      const buffer = await page.screenshot({
        omitBackground: true,
        clip: { x: 0, y: 0, width: ICON.size, height: ICON.size },
      });
      const target = `${res}/${file}`;
      await mkdir(target.slice(0, target.lastIndexOf('/')), { recursive: true });
      await writeFile(target, buffer);
      process.stdout.write(`wrote ${file} (${ICON.size}x${ICON.size})\n`);
    }
  } finally {
    await browser.close();
  }
}

async function verifyBitmaps(failures) {
  const lock = JSON.parse(await readFile(lockPath, 'utf8').catch(() => 'null'));
  if (lock === null) {
    failures.push(`${lockPath} is missing; run npm run bridge:icons`);
  } else {
    const mascot = await readFile(mascotPath).catch(() => null);
    if (mascot === null) failures.push(`${mascotPath} is missing`);
    else if (sha256(mascot) !== lock.mascotSha256)
      failures.push(`${mascotPath} has changed since the bridge icons were built`);
    if (sha256(Buffer.from(composition)) !== lock.compositionSha256)
      failures.push('the bridge icon composition has changed since the icons were built');
  }
  for (const { file } of bitmaps) {
    const target = `${res}/${file}`;
    const bytes = await readFile(target).catch(() => null);
    if (bytes === null) {
      failures.push(`${target} is missing`);
      continue;
    }
    if ((await stat(target)).size < MIN_BYTES) failures.push(`${target} is suspiciously small`);
    const dimensions = readPngDimensions(bytes);
    if (dimensions === null) failures.push(`${target} is not a valid PNG`);
    else if (dimensions.width !== ICON.size || dimensions.height !== ICON.size)
      failures.push(
        `${target} is ${dimensions.width}x${dimensions.height}, expected ${ICON.size}x${ICON.size}`,
      );
  }
}

const failures = [];
if (check) {
  await verifyBitmaps(failures);
  for (const [path, content] of files) {
    if ((await readFile(`${res}/${path}`, 'utf8').catch(() => null)) !== content)
      failures.push(`Stale Android brand resource: ${res}/${path}`);
  }
  if (failures.length > 0) {
    process.stderr.write(`Android brand resources failed:\n- ${failures.join('\n- ')}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write('Android brand resources verified\n');
  }
} else {
  const mascot = await readFile(mascotPath);
  await render(mascot);
  for (const [path, content] of files) {
    const target = `${res}/${path}`;
    await mkdir(target.slice(0, target.lastIndexOf('/')), { recursive: true });
    await writeFile(target, content);
    process.stdout.write(`wrote ${path}\n`);
  }
  await writeFile(
    lockPath,
    `${JSON.stringify(
      { mascotSha256: sha256(mascot), compositionSha256: sha256(Buffer.from(composition)) },
      null,
      2,
    )}\n`,
  );
  process.stdout.write(`wrote ${lockPath}\n`);
}
