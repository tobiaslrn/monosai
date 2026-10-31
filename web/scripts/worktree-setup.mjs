#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Makes this checkout able to run the repository's commands. A new worktree has
 * no `node_modules`, and a merge can leave an existing one behind the lockfile.
 * Does nothing when the checkout is already current, so every session can run it.
 */
const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function modifiedAt(path) {
  return statSync(path, { throwIfNoEntry: false })?.mtimeMs;
}

const requiredNode = readFileSync(resolve(WEB, '../.nvmrc'), 'utf8').trim().replace(/^v/, '');
if (process.versions.node !== requiredNode) {
  process.stderr.write(
    `worktree-setup: .nvmrc pins Node ${requiredNode}, running ${process.versions.node}\n`,
  );
}

const installedAt = modifiedAt(resolve(WEB, 'node_modules/.package-lock.json'));
if (
  installedAt === undefined ||
  installedAt < (modifiedAt(resolve(WEB, 'package-lock.json')) ?? 0)
) {
  process.stdout.write('worktree-setup: installing dependencies\n');
  execSync('npm ci --prefer-offline --no-audit --no-fund', { cwd: WEB, stdio: 'inherit' });
}

// Does nothing when the build Playwright pins is already on this machine.
execSync('npx playwright install chromium', { cwd: WEB, stdio: 'inherit' });
