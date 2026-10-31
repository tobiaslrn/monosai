import { createHash } from 'node:crypto';
import { lstatSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BASE_PORTS = Object.freeze({ dev: 4200, e2e: 4210, pwa: 4300 });

const SLOT_COUNT = 3000;
const FIRST_WORKTREE_PORT = 20_000;
const PORTS_PER_SLOT = 3;
const CHECKOUT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Picks the ports of a checkout so parallel worktrees never contend for one.
 *
 * Deterministic rather than "any free port": Playwright evaluates its config
 * again in every worker process, and a stable development port keeps a
 * worktree's browser data on one origin across restarts. Two running worktrees
 * whose paths share a slot fail loudly, because neither reuses a server, and
 * `MONOSAI_PORT_SLOT` moves one of them.
 */
export function resolvePorts({ root, isLinkedWorktree, isCi, slotOverride }) {
  if (!isLinkedWorktree || isCi) {
    return BASE_PORTS;
  }
  const slot = slotOverride === undefined ? slotForPath(root) : parseSlot(slotOverride);
  const first = FIRST_WORKTREE_PORT + slot * PORTS_PER_SLOT;
  return { dev: first, e2e: first + 1, pwa: first + 2 };
}

/** The ports of the checkout this module belongs to. */
export function worktreePorts(env = process.env) {
  return resolvePorts({
    root: CHECKOUT_ROOT,
    // A linked worktree's `.git` is a file that points into the main checkout.
    isLinkedWorktree:
      lstatSync(resolve(CHECKOUT_ROOT, '.git'), { throwIfNoEntry: false })?.isFile() === true,
    isCi: env.CI === 'true',
    slotOverride: env.MONOSAI_PORT_SLOT,
  });
}

function slotForPath(root) {
  return createHash('sha256').update(root).digest().readUInt32BE(0) % SLOT_COUNT;
}

function parseSlot(value) {
  const slot = Number(value);
  if (!Number.isInteger(slot) || slot < 0 || slot >= SLOT_COUNT) {
    throw new Error(`MONOSAI_PORT_SLOT must be an integer from 0 to ${String(SLOT_COUNT - 1)}`);
  }
  return slot;
}
