import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export const MARK_SOURCE_PATH = join(ROOT, 'data', 'brand', 'monosai-mark.svg');
export const ICONS_OUTPUT_DIR = join(ROOT, 'public', 'icons');

/** The safe-zone inset applied to the maskable variant, per the maskable icon spec. */
export const MASKABLE_SAFE_ZONE_SCALE = 0.8;

/**
 * The four icons the manifest declares. `variant` selects how
 * `build-icons.mjs` composes the source mark for that target:
 *  - "any": the mark rendered as authored, filling the canvas.
 *  - "maskable": a full-bleed square background with the mark inset to the
 *    maskable safe zone.
 *  - "apple": same composition as "any", flattened so no alpha channel ships.
 */
export const ICON_TARGETS = [
  { file: 'icon-192.png', size: 192, variant: 'any', purpose: 'any' },
  { file: 'icon-512.png', size: 512, variant: 'any', purpose: 'any' },
  { file: 'icon-maskable-512.png', size: 512, variant: 'maskable', purpose: 'maskable' },
  { file: 'apple-touch-icon-180.png', size: 180, variant: 'apple', purpose: null },
];
