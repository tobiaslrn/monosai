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

/** The one place the loopback contract version is written down. */
export const CONTRACT_PATH = 'protocol/contract.txt';

/**
 * A bumped contract has to reach people, and only a new release does that.
 *
 * A patch release says the wire did not change, so shipping a new contract
 * inside one would leave the web app negotiating against a number no published
 * APK speaks. Minor is the smallest bump that carries a contract.
 */
export function contractNeedsRelease(previous, next) {
  if (previous.contract === next.contract) return null;
  if (next.contract <= previous.contract)
    return `The contract must only ever rise: ${previous.contract} -> ${next.contract}.`;
  const [wasMajor, wasMinor] = previous.version.name.split('.').map(Number);
  const [isMajor, isMinor] = next.version.name.split('.').map(Number);
  if (isMajor === wasMajor && isMinor === wasMinor)
    return (
      `Contract ${previous.contract} -> ${next.contract} needs at least a minor bump of ` +
      `${VERSION_PATH}; ${previous.version.name} -> ${next.version.name} is a patch.`
    );
  return null;
}

/** Reads the committed contract version, held to the same whitespace rule as the version. */
export async function committedContract(path = CONTRACT_PATH) {
  const contents = await readFile(path, 'utf8');
  if (!/^[^\n]+\n$/u.test(contents)) throw new Error(`${path} must hold one number and a newline`);
  // Matched rather than coerced: `Number(' 2')` is 2, which would quietly accept
  // a file the bridge's own Gradle reader would go on to reject.
  const digits = contents.slice(0, -1);
  if (!/^[1-9]\d*$/u.test(digits) || Number(digits) > 1_000)
    throw new Error(`${path} must hold a single integer contract version`);
  return Number(digits);
}

/** Reads the committed version, rejecting stray whitespace rather than trimming it away. */
export async function committedVersion(path = VERSION_PATH) {
  const contents = await readFile(path, 'utf8');
  if (!/^[^\n]+\n$/u.test(contents)) throw new Error(`${path} must hold one version and a newline`);
  return releaseVersion(contents.slice(0, -1));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // `--guard <previous version> <previous contract>` compares this commit with the
  // last published release. The caller reads the previous values out of git,
  // which keeps this script a pure comparison with a test that needs no history.
  if (process.argv[2] === '--guard') {
    const complaint = contractNeedsRelease(
      { version: releaseVersion(process.argv[3]), contract: Number(process.argv[4]) },
      { version: await committedVersion(), contract: await committedContract() },
    );
    if (complaint) {
      process.stderr.write(`::error::${complaint}\n`);
      process.exit(1);
    }
    process.stdout.write('The committed contract fits the version it ships in.\n');
    process.exit(0);
  }
  const argument = process.argv[2];
  const version = argument ? releaseVersion(argument) : await committedVersion();
  const output =
    `BRIDGE_VERSION_CODE=${version.code}\n` +
    `BRIDGE_VERSION_NAME=${version.name}\n` +
    `BRIDGE_TAG=${version.tag}\n`;
  if (process.env['GITHUB_ENV']) await appendFile(process.env['GITHUB_ENV'], output);
  else process.stdout.write(output);
}
