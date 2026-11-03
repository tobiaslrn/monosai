import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export const ICON_SOURCE_PATH = join(ROOT, 'data', 'brand', 'monosai-icon.png');
export const ICONS_OUTPUT_DIR = join(ROOT, 'public', 'icons');
export const FAVICON_PATH = join(ROOT, 'public', 'favicon.ico');

/** The source mascot is transparent; every icon is flattened onto `--action-primary`. */
export const ICON_BACKGROUND = '#347e55';

/**
 * The mascot's width as a share of the maskable canvas.
 *
 * Launcher masks keep only a centred circle of about 80%, so the maskable
 * variant is the authored icon zoomed out until the ears and the two marks
 * clear that circle: at this scale the marks, which are the closest thing to a
 * corner, sit at radius 0.356 of the 0.400 the mask guarantees.
 *
 * It stays anchored to the bottom edge. The mascot is authored cropped — its
 * body covers the source's entire bottom row — so drawing it flush reproduces
 * the same body leaving the canvas that the unmasked icons show. Raising it
 * instead would end the body in mid-air partway up the canvas, and the only way
 * to hide that is to stretch its last row of pixels down to the edge, which
 * replaces the body's curve with two straight vertical sides.
 */
export const MASKABLE_SCALE = 0.78;

/**
 * The generated browser, PWA, and Apple icon targets. `variant` selects how
 * `build-icons.mjs` composes the source mascot for that target:
 *  - "any": the mascot as authored, filling the canvas.
 *  - "maskable": the mascot at `MASKABLE_SCALE`, so a launcher mask keeps its
 *    face, ears, and marks whole.
 *  - "apple": same composition as "any".
 */
export const ICON_TARGETS = [
  { file: 'favicon-32.png', size: 32, variant: 'any', purpose: null },
  { file: 'icon-192.png', size: 192, variant: 'any', purpose: 'any' },
  { file: 'icon-512.png', size: 512, variant: 'any', purpose: 'any' },
  { file: 'icon-maskable-512.png', size: 512, variant: 'maskable', purpose: 'maskable' },
  { file: 'apple-touch-icon-180.png', size: 180, variant: 'apple', purpose: null },
];
