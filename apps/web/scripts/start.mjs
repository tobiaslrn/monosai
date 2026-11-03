#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { worktreePorts } from './worktree-ports.mjs';

// `ng serve` on this checkout's own port. An explicit `--port` still wins.
const args = process.argv.slice(2);
const hasPort = args.some((arg) => arg === '--port' || arg.startsWith('--port='));
const portArgs = hasPort ? [] : ['--port', String(worktreePorts().dev)];

// The engine module the dev server serves; cargo skips it when nothing changed.
const engine = spawnSync('cargo', ['xtask', 'wasm'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (engine.status !== 0) {
  process.exit(engine.status ?? 1);
}

const { status } = spawnSync(
  process.execPath,
  ['node_modules/@angular/cli/bin/ng.js', 'serve', ...portArgs, ...args],
  {
    stdio: 'inherit',
  },
);
process.exitCode = status ?? 1;
