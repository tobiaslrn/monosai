import { mkdir, readFile, writeFile } from 'node:fs/promises';

// Reuse the authored SVG paths and colours; do not draw a second brand mark.
const source = await readFile('web/data/brand/monosai-mark.svg', 'utf8');
if (
  !source.includes('viewBox="0 0 1024 1024"') ||
  !source.includes('translate(-102.4,-102.4) scale(1.2)')
) {
  throw new Error('Brand mark structure changed; review the Android vector transform');
}
const paths = [...source.matchAll(/<path fill="(#[A-Fa-f0-9]+)" d="([^"]+)"\s*\/>/gu)];
const background = /<rect id="bg"[^>]*fill="(#[A-Fa-f0-9]+)"/u.exec(source)?.[1];
if (paths.length !== 2 || !background)
  throw new Error('Brand mark is missing its paths or background');
const res = 'android-bridge/app/src/main/res';
const files = new Map();
for (const [name, monochrome, adaptive] of [
  ['bridge_foreground', false, true],
  ['bridge_monochrome', true, true],
  ['bridge_status', true, false],
]) {
  const outline = paths
    .map(
      ([, color, data]) =>
        `      <path android:fillColor="${monochrome ? '#FFFFFF' : color}" android:pathData="${data}" />`,
    )
    .join('\n');
  // Android's 108dp adaptive canvas includes overscan. Keep the whole mark in
  // the central circular safe zone, across circular and rounded-square masks.
  files.set(
    `drawable/${name}.xml`,
    `<!-- Generated from web/data/brand/monosai-mark.svg by scripts/bridge/icons.mjs -->\n<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="${adaptive ? 108 : 24}dp" android:height="${adaptive ? 108 : 24}dp" android:viewportWidth="1024" android:viewportHeight="1024">\n  <group android:pivotX="512" android:pivotY="512" android:scaleX="${adaptive ? 0.56 : 1}" android:scaleY="${adaptive ? 0.56 : 1}">\n    <group android:translateX="-102.4" android:translateY="-102.4" android:scaleX="1.2" android:scaleY="1.2">\n${outline}\n    </group>\n  </group>\n</vector>\n`,
  );
}
files.set(
  'values/brand.xml',
  `<resources>\n    <color name="bridge_background">${background}</color>\n    <string name="app_name" translatable="false">Monosai Anki bridge</string>\n</resources>\n`,
);
files.set(
  'mipmap-anydpi-v26/ic_launcher.xml',
  `<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n    <background android:drawable="@color/bridge_background" />\n    <foreground android:drawable="@drawable/bridge_foreground" />\n    <monochrome android:drawable="@drawable/bridge_monochrome" />\n</adaptive-icon>\n`,
);
for (const [path, content] of files) {
  const target = `${res}/${path}`;
  if (process.argv.includes('--check')) {
    if ((await readFile(target, 'utf8')) !== content)
      throw new Error(`Stale Android brand resource: ${target}`);
  } else {
    await mkdir(target.slice(0, target.lastIndexOf('/')), { recursive: true });
    await writeFile(target, content);
  }
}
console.log('Android brand resources verified');
