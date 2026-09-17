import { appendFile, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

/** The one place the bridge's version is written down. */
export const VERSION_PATH = 'android-bridge/version.txt';

export const releaseTag = (name) => `bridge-v${name}`;

/**
 * A bounded MAJOR.MINOR.PATCH, mapped to a version code that keeps ordering
 * across component boundaries. Android refuses to install an APK whose code did
 * not increase, and the in-app updater compares the same number, so the range of
 * each component is fixed rather than merely conventional.
 */
export function releaseVersion(value) {
  const name = value.startsWith('bridge-v') ? value.slice('bridge-v'.length) : value;
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.exec(name);
  if (!match) throw new Error('Expected MAJOR.MINOR.PATCH');
  const [major, minor, patch] = match.slice(1).map(Number);
  if (major > 2099 || minor > 999 || patch > 999)
    throw new Error('Version component exceeds its range');
  const code = major * 1_000_000 + minor * 1_000 + patch;
  if (!Number.isSafeInteger(code) || code < 1) throw new Error('Invalid version code');
  return { code, name, tag: releaseTag(name) };
}

/** Reads the committed version, rejecting stray whitespace rather than trimming it away. */
export async function committedVersion(path = VERSION_PATH) {
  const contents = await readFile(path, 'utf8');
  if (!/^[^\n]+\n$/u.test(contents)) throw new Error(`${path} must hold one version and a newline`);
  return releaseVersion(contents.slice(0, -1));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argument = process.argv[2];
  const version = argument ? releaseVersion(argument) : await committedVersion();
  const output =
    `BRIDGE_VERSION_CODE=${version.code}\n` +
    `BRIDGE_VERSION_NAME=${version.name}\n` +
    `BRIDGE_TAG=${version.tag}\n`;
  if (process.env['GITHUB_ENV']) await appendFile(process.env['GITHUB_ENV'], output);
  else process.stdout.write(output);
}
