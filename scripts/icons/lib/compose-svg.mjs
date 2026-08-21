import { MASKABLE_SAFE_ZONE_SCALE } from './layout.mjs';

const BG_MATCH = /<rect id="bg"[^>]*\/>/;
const MARK_MATCH = /<g id="mark">[\s\S]*?<\/g>/;

/**
 * Composes the raster-ready SVG for one icon variant from the committed
 * source mark. The source already fills a 512x512 canvas with a rounded-rect
 * background and a centred mark group; each variant re-wraps that mark
 * rather than re-authoring geometry, so there is exactly one drawn shape.
 */
export function composeIconSvg(sourceSvg, variant) {
  const bg = sourceSvg.match(BG_MATCH)?.[0];
  const mark = sourceSvg.match(MARK_MATCH)?.[0];
  if (!bg || !mark) {
    throw new Error('monosai-mark.svg is missing the expected #bg rect or #mark group');
  }

  if (variant === 'any' || variant === 'apple') {
    return `<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">${bg}${mark}</svg>`;
  }

  if (variant === 'maskable') {
    const fullBleedBg = bg.replace(/ rx="\d+(\.\d+)?"/, '');
    const center = 256;
    const scale = MASKABLE_SAFE_ZONE_SCALE;
    const translate = center - center * scale;
    return `<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">${fullBleedBg}<g transform="translate(${translate},${translate}) scale(${scale})">${mark}</g></svg>`;
  }

  throw new Error(`unknown icon variant: ${variant}`);
}
