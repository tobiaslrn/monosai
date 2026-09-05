import { MASKABLE_SAFE_ZONE_SCALE } from './layout.mjs';

const VIEWBOX_MATCH = /<svg\b[^>]*\bviewBox\s*=\s*["']([^"']+)["'][^>]*>/i;
const BG_MATCH = /<rect\b[^>]*\bid="bg"[^>]*\/>/i;
const MARK_MATCH = /<g\b[^>]*\bid="mark"[^>]*>[\s\S]*?<\/g>/i;

function readViewBox(sourceSvg) {
  const match = sourceSvg.match(VIEWBOX_MATCH);
  const values = match?.[1]
    ?.trim()
    .split(/[\s,]+/)
    .map((value) => Number(value));
  if (values?.length !== 4 || values.some((value) => !Number.isFinite(value))) {
    throw new Error('monosai-mark.svg is missing a valid viewBox');
  }
  return values;
}

function centeredTransform(viewBox, scale) {
  const centerX = viewBox[0] + viewBox[2] / 2;
  const centerY = viewBox[1] + viewBox[3] / 2;
  return {
    translateX: centerX - centerX * scale,
    translateY: centerY - centerY * scale,
  };
}

/**
 * Composes the raster-ready SVG for one icon variant from the committed
 * source mark. The source provides a full-canvas background and a centred mark
 * group; each variant re-wraps that mark rather than re-authoring geometry.
 */
export function composeIconSvg(sourceSvg, variant) {
  const bg = sourceSvg.match(BG_MATCH)?.[0];
  const mark = sourceSvg.match(MARK_MATCH)?.[0];
  const viewBox = readViewBox(sourceSvg);
  if (!bg || !mark) {
    throw new Error('monosai-mark.svg is missing the expected #bg rect or #mark group');
  }

  if (variant === 'any' || variant === 'apple') {
    return `<svg viewBox="${viewBox.join(' ')}" xmlns="http://www.w3.org/2000/svg">${bg}${mark}</svg>`;
  }

  if (variant === 'maskable') {
    const fullBleedBg = bg.replace(/\s+r[xy]="[^"]*"/gi, '');
    const scale = MASKABLE_SAFE_ZONE_SCALE;
    const { translateX, translateY } = centeredTransform(viewBox, scale);
    return `<svg viewBox="${viewBox.join(' ')}" xmlns="http://www.w3.org/2000/svg">${fullBleedBg}<g transform="translate(${translateX},${translateY}) scale(${scale})">${mark}</g></svg>`;
  }

  throw new Error(`unknown icon variant: ${variant}`);
}
