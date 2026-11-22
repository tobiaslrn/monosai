import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  checkAndroidColours,
  compareColours,
  paletteOf,
  parseHex,
  resolveToken,
} from './android-colours.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const tokens = `
@mixin light-palette {
  --surface-raised: #ffffff;
  --text-primary: #252824;
  --shadow-raised: 0 1px 2px rgb(37 40 36 / 8%), 0 4px 12px rgb(37 40 36 / 6%);
}

@mixin dark-palette {
  --surface-raised: #2b2f2a;
  --text-primary: #eceae4;
  --surface-sunken: color-mix(in srgb, var(--text-primary) 8%, transparent);
  --shadow-raised: 0 1px 2px rgb(0 0 0 / 40%);
  --gradient: linear-gradient(red, blue);
}
`;

const xml = (colours) =>
  `<resources>\n${Object.entries(colours)
    .map(([name, value]) => `    <color name="${name}">${value}</color>`)
    .join('\n')}\n</resources>`;

test('the bridge colours match the tokens in both themes', async () => {
  assert.deepEqual(await checkAndroidColours(repoRoot), []);
});

test('reads Android ARGB and web RGBA hex', () => {
  assert.deepEqual(parseHex('#14252824', true), { a: 0x14, r: 0x25, g: 0x28, b: 0x24 });
  assert.deepEqual(parseHex('#fff'), { r: 255, g: 255, b: 255, a: 255 });
  assert.equal(parseHex('red'), null);
});

test('resolves a hex, a translucent mix over the raised surface, and a shadow', () => {
  const dark = paletteOf(tokens, 'dark-palette');
  assert.deepEqual(resolveToken(dark, 'text-primary'), { r: 236, g: 234, b: 228, a: 255 });
  assert.deepEqual(resolveToken(dark, 'surface-sunken'), { r: 58, g: 62, b: 57, a: 255 });
  assert.deepEqual(resolveToken(dark, 'shadow-raised'), { r: 0, g: 0, b: 0, a: 102 });
  assert.equal(resolveToken(dark, 'gradient'), null);
  const light = paletteOf(tokens, 'light-palette');
  assert.deepEqual(resolveToken(light, 'shadow-raised'), { r: 37, g: 40, b: 36, a: 20 });
});

test('names a bridge colour that drifted from its token, with the fix and R47', () => {
  const dark = paletteOf(tokens, 'dark-palette');
  const file = 'values-night/colors.xml';
  assert.deepEqual(
    compareColours(dark, xml({ text_primary: '#ECEAE4', surface_sunken: '#3A3E39' }), file, 'dark'),
    [],
  );
  // One step of rounding is allowed.
  assert.deepEqual(compareColours(dark, xml({ text_primary: '#EDEAE4' }), file, 'dark'), []);
  const [drift] = compareColours(dark, xml({ text_primary: '#FFFFFF' }), file, 'dark');
  assert.match(drift, /text_primary is #FFFFFF, but --text-primary in the dark palette is #ECEAE4/);
  assert.match(drift, /Fix: .*\(R47 in docs\/design\/rules\.md\)$/);
  const [unknown] = compareColours(dark, xml({ brand_pink: '#FF00FF' }), file, 'dark');
  assert.match(unknown, /brand_pink has no --brand-pink/);
});
