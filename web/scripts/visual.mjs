#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHECKOUT = resolve(WEB, '..');

/**
 * The image the screenshot baselines are drawn in: Playwright's own, at the
 * version the lockfile pins, so the browser, its fonts and its libraries are
 * the ones CI uses. The CI workflows name the same tag; a test holds them to it.
 */
export function playwrightImage(
  lockfile = readFileSync(resolve(WEB, 'package-lock.json'), 'utf8'),
) {
  const version = JSON.parse(lockfile).packages?.['node_modules/@playwright/test']?.version;
  if (typeof version !== 'string') {
    throw new Error('package-lock.json does not pin @playwright/test');
  }
  return `mcr.microsoft.com/playwright:v${version}-noble`;
}

/** Whether this process already runs inside that image, as CI's visual job does. */
function insidePlaywrightImage() {
  return process.env.PLAYWRIGHT_BROWSERS_PATH === '/ms-playwright' && existsSync('/ms-playwright');
}

function run(command, args, options = {}) {
  const { status } = spawnSync(command, args, { cwd: WEB, stdio: 'inherit', ...options });
  return status ?? 1;
}

/**
 * Runs the visual suite (`playwright.visual.config.ts`) where its baselines
 * mean something.
 *
 * Inside the pinned image it runs Playwright directly. Anywhere else it builds
 * the gallery here, if it is stale, and runs the suite in that image through
 * Docker against the checkout mounted at the same path, so the result matches
 * CI. Arguments go to `playwright test`; `--update-snapshots` redraws the
 * baselines, which only the owner-triggered workflow should commit.
 */
function main(args) {
  const playwright = [
    'node_modules/@playwright/test/cli.js',
    'test',
    '--config=playwright.visual.config.ts',
  ];
  if (insidePlaywrightImage()) {
    return run(process.execPath, [...playwright, ...args]);
  }
  if (process.env.MONOSAI_PREBUILT_DIST !== 'true') {
    const built = run(process.execPath, ['scripts/build-if-stale.mjs', '--gallery']);
    if (built !== 0) return built;
  }
  if (spawnSync('docker', ['info'], { stdio: 'ignore' }).status !== 0) {
    process.stderr.write(
      'visual: Docker is not available. The baselines are drawn in the pinned Playwright image,\n' +
        `${playwrightImage()}, and only compare there. Start Docker and run this again.\n`,
    );
    return 1;
  }
  const user =
    typeof process.getuid === 'function' ? [`--user=${process.getuid()}:${process.getgid()}`] : [];
  return run('docker', [
    'run',
    '--rm',
    '--ipc=host',
    ...user,
    '--env=HOME=/tmp',
    '--env=MONOSAI_PREBUILT_DIST=true',
    ...['CI', 'MONOSAI_PORT_SLOT'].flatMap((name) =>
      process.env[name] === undefined ? [] : [`--env=${name}=${process.env[name]}`],
    ),
    `--volume=${CHECKOUT}:${CHECKOUT}`,
    `--workdir=${WEB}`,
    playwrightImage(),
    'node',
    ...playwright,
    ...args,
  ]);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
