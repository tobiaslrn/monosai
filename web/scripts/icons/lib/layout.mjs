import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export const ICON_SOURCE_PATH = join(ROOT, 'data', 'brand', 'monosai-icon.png');
export const ICONS_OUTPUT_DIR = join(ROOT, 'public', 'icons');
export const FAVICON_PATH = join(ROOT, 'public', 'favicon.ico');

/**
 * The generated browser, PWA, and Apple icon targets. `variant` selects how
 * `build-icons.mjs` composes the source mascot for that target:
 *  - "any": the mascot rendered as authored, filling the canvas.
 *  - "maskable": the same full-canvas mascot, allowing the platform to apply
 *    its own launcher mask without introducing a second background colour.
 *  - "apple": same composition as "any", flattened so no alpha channel ships.
 */
export const ICON_TARGETS = [
  { file: 'favicon-32.png', size: 32, variant: 'any', purpose: null },
  { file: 'icon-192.png', size: 192, variant: 'any', purpose: 'any' },
  { file: 'icon-512.png', size: 512, variant: 'any', purpose: 'any' },
  { file: 'icon-maskable-512.png', size: 512, variant: 'maskable', purpose: 'maskable' },
  { file: 'apple-touch-icon-180.png', size: 180, variant: 'apple', purpose: null },
];
