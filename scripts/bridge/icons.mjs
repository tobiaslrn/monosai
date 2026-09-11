import { mkdir, readFile, writeFile } from 'node:fs/promises';

const sourcePath = 'web/data/brand/monosai-icon.png';
const maskablePath = 'web/public/icons/icon-maskable-512.png';
const res = 'android-bridge/app/src/main/res';
const check = process.argv.includes('--check');
const bitmaps = new Map([
  ['drawable-nodpi/monosai_icon.png', sourcePath],
  ['drawable-nodpi/monosai_icon_maskable.png', maskablePath],
]);
const files = new Map();

const generated = (source) => `<!-- Generated from ${source} by scripts/bridge/icons.mjs -->\n`;
const android = 'xmlns:android="http://schemas.android.com/apk/res/android"';
// An adaptive icon shows only the middle 72 of its 108 dp. Inset by 9 dp, the PWA's
// maskable icon lays its 80% safe circle exactly over that window, so both launchers
// frame the mascot alike; the monochrome silhouette takes the same place.
files.set(
  'drawable/bridge_foreground.xml',
  `${generated(maskablePath)}<inset ${android} android:inset="8.333%">\n    <bitmap android:src="@drawable/monosai_icon_maskable" android:gravity="fill" />\n</inset>\n`,
);
files.set(
  'drawable/bridge_monochrome.xml',
  `${generated(sourcePath)}<inset ${android} android:insetLeft="20%" android:insetRight="20%" android:insetTop="23.333%" android:insetBottom="16.667%">\n    <bitmap android:src="@drawable/monosai_icon" android:gravity="fill" />\n</inset>\n`,
);
files.set(
  'drawable/bridge_status.xml',
  `${generated(sourcePath)}<bitmap ${android} android:src="@drawable/monosai_icon" android:gravity="fill" />\n`,
);
files.set(
  'values/brand.xml',
  `<resources>\n    <color name="bridge_background">#347E55</color>\n    <string name="app_name" translatable="false">Monosai Anki bridge</string>\n</resources>\n`,
);
files.set(
  'mipmap-anydpi-v26/ic_launcher.xml',
  `<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n    <background android:drawable="@color/bridge_background" />\n    <foreground android:drawable="@drawable/bridge_foreground" />\n    <monochrome android:drawable="@drawable/bridge_monochrome" />\n</adaptive-icon>\n`,
);

for (const [path, sourceFile] of bitmaps) {
  const target = `${res}/${path}`;
  const source = await readFile(sourceFile);
  if (check) {
    const existing = await readFile(target).catch(() => null);
    if (existing === null || !existing.equals(source)) {
      throw new Error(`Stale Android brand resource: ${target}`);
    }
  } else {
    await mkdir(target.slice(0, target.lastIndexOf('/')), { recursive: true });
    await writeFile(target, source);
  }
}

for (const [path, content] of files) {
  const target = `${res}/${path}`;
  if (check) {
    if ((await readFile(target, 'utf8')) !== content)
      throw new Error(`Stale Android brand resource: ${target}`);
  } else {
    await mkdir(target.slice(0, target.lastIndexOf('/')), { recursive: true });
    await writeFile(target, content);
  }
}
console.log('Android brand resources verified');
