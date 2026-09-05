import { appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function releaseVersion(tag) {
  const match = /^bridge-v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.exec(tag);
  if (!match) throw new Error('Expected bridge-vMAJOR.MINOR.PATCH');
  const [major, minor, patch] = match.slice(1).map(Number);
  if (major > 2099 || minor > 999 || patch > 999)
    throw new Error('Version component exceeds its range');
  const code = major * 1_000_000 + minor * 1_000 + patch;
  if (!Number.isSafeInteger(code) || code < 1) throw new Error('Invalid version code');
  return { code, name: `${major}.${minor}.${patch}` };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const version = releaseVersion(process.env['GITHUB_REF_NAME'] ?? process.argv[2] ?? '');
  const output = `BRIDGE_VERSION_CODE=${version.code}\nBRIDGE_VERSION_NAME=${version.name}\n`;
  if (process.env['GITHUB_ENV']) await appendFile(process.env['GITHUB_ENV'], output);
  else process.stdout.write(output);
}
