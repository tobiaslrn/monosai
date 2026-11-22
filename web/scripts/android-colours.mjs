// The Android bridge cannot read the PWA's custom properties, so
// android-bridge/app/src/main/res/values{,-night}/colors.xml copies the colour
// roles it uses from web/src/styles/_tokens.scss under the same names
// (`surface_canvas` is `--surface-canvas`). This compares each copy with its
// token in the light or dark palette:
//
// - a hex token is copied as it is;
// - a translucent `color-mix(in srgb, var(--x) P%, transparent)` is copied
//   flattened over that palette's `--surface-raised`, since Android has no
//   layer beneath it to mix with;
// - a shadow is copied as the colour and alpha of its first layer.
//
// Channels may differ by one, for rounding.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cite } from './design-lint-rules.mjs';

export const TOKENS = 'web/src/styles/_tokens.scss';
export const BRIDGE = {
  light: 'android-bridge/app/src/main/res/values/colors.xml',
  dark: 'android-bridge/app/src/main/res/values-night/colors.xml',
};

/** The custom properties a `@mixin <name>` block of the tokens declares. */
export function paletteOf(tokens, mixin) {
  const start = tokens.indexOf(`@mixin ${mixin} {`);
  if (start < 0) return null;
  const end = tokens.indexOf('\n}', start);
  const body = tokens.slice(start, end < 0 ? undefined : end);
  return Object.fromEntries(
    [...body.matchAll(/^\s*--([a-z0-9-]+)\s*:\s*([^;]+);/gm)].map((m) => [m[1], m[2].trim()]),
  );
}

/** `<color name="x">#…</color>` entries of an Android resource file. */
export function androidColoursOf(xml) {
  return Object.fromEntries(
    [...xml.matchAll(/<color\s+name="([a-z0-9_]+)"\s*>\s*([^<\s]+)\s*<\/color>/g)].map((m) => [
      m[1],
      m[2],
    ]),
  );
}

/** A `#rgb`, `#rrggbb` or `#aarrggbb` (Android order) colour as { r, g, b, a } in 0–255. */
export function parseHex(text, alphaFirst = false) {
  let hex = /^#([0-9a-f]+)$/i.exec(text.trim())?.[1];
  if (!hex) return null;
  if (hex.length === 3) hex = [...hex].map((c) => c + c).join('');
  if (hex.length === 6) hex = alphaFirst ? `ff${hex}` : `${hex}ff`;
  if (hex.length !== 8) return null;
  const n = (i) => parseInt(hex.slice(i, i + 2), 16);
  return alphaFirst
    ? { a: n(0), r: n(2), g: n(4), b: n(6) }
    : { r: n(0), g: n(2), b: n(4), a: n(6) };
}

const hexOf = ({ r, g, b, a }) =>
  `#${(a === 255 ? [r, g, b] : [a, r, g, b])
    .map((c) => c.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;

/** The opaque colour a web token resolves to, or null when it cannot be mirrored. */
export function resolveToken(palette, name, seen = new Set()) {
  const value = palette[name];
  if (value === undefined || seen.has(name)) return null;
  seen.add(name);
  const hex = parseHex(value);
  if (hex) return hex;
  const mix =
    /^color-mix\(\s*in srgb\s*,\s*var\(--([a-z0-9-]+)\)\s+([\d.]+)%\s*,\s*transparent\s*\)$/i.exec(
      value,
    );
  if (mix) {
    const ink = resolveToken(palette, mix[1], seen);
    const ground = resolveToken(palette, 'surface-raised', new Set());
    if (!ink || !ground) return null;
    const p = Number(mix[2]) / 100;
    const blend = (key) => Math.round(ink[key] * p + ground[key] * (1 - p));
    return { r: blend('r'), g: blend('g'), b: blend('b'), a: 255 };
  }
  const shadow = /\brgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*[/,]\s*([\d.]+)(%?)\s*\)/.exec(value);
  if (shadow) {
    const alpha = Number(shadow[4]) / (shadow[5] ? 100 : 1);
    return {
      r: Number(shadow[1]),
      g: Number(shadow[2]),
      b: Number(shadow[3]),
      a: Math.round(alpha * 255),
    };
  }
  return null;
}

/** Errors for every bridge colour that differs from its token in a palette. */
export function compareColours(palette, xml, file, theme) {
  const errors = [];
  for (const [name, text] of Object.entries(androidColoursOf(xml))) {
    const token = `--${name.replaceAll('_', '-')}`;
    const android = parseHex(text, true);
    const web = resolveToken(palette, token.slice(2));
    if (!android) {
      errors.push(
        `${file} ${name} is "${text}", not a hex colour. Fix: copy ${token}. ${cite('R47')}`,
      );
    } else if (!web) {
      errors.push(
        `${file} ${name} has no ${token} in the ${theme} palette of ${TOKENS} that it can mirror. ` +
          `Fix: name the bridge colour after the token it copies, or remove it. ${cite('R47')}`,
      );
    } else if (['r', 'g', 'b', 'a'].some((key) => Math.abs(android[key] - web[key]) > 1)) {
      errors.push(
        `${file} ${name} is ${hexOf(android)}, but ${token} in the ${theme} palette is ` +
          `${hexOf(web)}. Fix: update the bridge colour in the same commit as the token. ` +
          cite('R47'),
      );
    }
  }
  return errors;
}

/** The bridge colours match the light and dark palettes of the tokens. */
export async function checkAndroidColours(repoRoot) {
  const tokens = await readFile(join(repoRoot, TOKENS), 'utf8');
  const errors = [];
  for (const [theme, file] of Object.entries(BRIDGE)) {
    const palette = paletteOf(tokens, `${theme}-palette`);
    if (!palette) {
      errors.push(`${TOKENS} has no @mixin ${theme}-palette. Fix: restore it. ${cite('R47')}`);
      continue;
    }
    errors.push(
      ...compareColours(palette, await readFile(join(repoRoot, file), 'utf8'), file, theme),
    );
  }
  return errors;
}
