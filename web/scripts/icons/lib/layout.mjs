import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export const ICON_SOURCE_PATH = join(ROOT, 'data', 'brand', 'monosai-icon.png');
export const ICONS_OUTPUT_DIR = join(ROOT, 'public', 'icons');
export const FAVICON_PATH = join(ROOT, 'public', 'favicon.ico');

/** The source mascot is transparent; every icon is flattened onto `--action-primary`. */
export const ICON_BACKGROUND = '#347e55';

/**
 * The mascot's width as a share of the maskable canvas, and how far it is
 * raised off the bottom edge. Launcher masks keep only a centred circle of
 * about 80%, so the mascot shrinks and rises until its ears, face, and marks
 * sit centred inside it; its body is extended down to the edge beneath it.
 */
export const MASKABLE_SCALE = 0.72;
export const MASKABLE_LIFT = 0.1;

/**
 * The generated browser, PWA, and Apple icon targets. `variant` selects how
 * `build-icons.mjs` composes the source mascot for that target:
 *  - "any": the mascot as authored, filling the canvas.
 *  - "maskable": the mascot at `MASKABLE_SCALE`, raised by `MASKABLE_LIFT`,
 *    so a launcher mask centres it without cropping its face or ears.
 *  - "apple": same composition as "any".
 */
export const ICON_TARGETS = [
  { file: 'favicon-32.png', size: 32, variant: 'any', purpose: null },
  { file: 'icon-192.png', size: 192, variant: 'any', purpose: 'any' },
  { file: 'icon-512.png', size: 512, variant: 'any', purpose: 'any' },
  { file: 'icon-maskable-512.png', size: 512, variant: 'maskable', purpose: 'maskable' },
  { file: 'apple-touch-icon-180.png', size: 180, variant: 'apple', purpose: null },
];
