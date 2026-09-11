import { mkdir, readFile, writeFile } from 'node:fs/promises';

const sourcePath = 'web/data/brand/monosai-icon.png';
const source = await readFile(sourcePath);
const res = 'android-bridge/app/src/main/res';
const files = new Map();

for (const name of ['bridge_foreground', 'bridge_monochrome', 'bridge_status']) {
  files.set(
    `drawable/${name}.xml`,
    `<!-- Generated from ${sourcePath} by scripts/bridge/icons.mjs -->\n<bitmap xmlns:android="http://schemas.android.com/apk/res/android" android:src="@drawable/monosai_icon" android:gravity="fill" />\n`,
  );
}
files.set(
  'values/brand.xml',
  `<resources>\n    <color name="bridge_background">#669360</color>\n    <string name="app_name" translatable="false">Monosai Anki bridge</string>\n</resources>\n`,
);
files.set(
  'mipmap-anydpi-v26/ic_launcher.xml',
  `<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n    <background android:drawable="@color/bridge_background" />\n    <foreground android:drawable="@drawable/bridge_foreground" />\n    <monochrome android:drawable="@drawable/bridge_monochrome" />\n</adaptive-icon>\n`,
);

const bitmapTarget = `${res}/drawable-nodpi/monosai_icon.png`;
const existingBitmap = await readFile(bitmapTarget).catch(() => null);
if (process.argv.includes('--check')) {
  if (existingBitmap === null || !existingBitmap.equals(source)) {
    throw new Error(`Stale Android brand resource: ${bitmapTarget}`);
  }
} else {
  await mkdir(`${res}/drawable-nodpi`, { recursive: true });
  await writeFile(bitmapTarget, source);
}

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
