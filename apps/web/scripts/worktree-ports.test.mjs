import assert from 'node:assert/strict';
import test from 'node:test';
import { BASE_PORTS, resolvePorts } from './worktree-ports.mjs';

const WORKTREE = { root: '/repo/.claude/worktrees/a', isLinkedWorktree: true, isCi: false };

test('the main checkout keeps the base ports', () => {
  assert.deepEqual(resolvePorts({ ...WORKTREE, isLinkedWorktree: false }), BASE_PORTS);
});

test('CI keeps the base ports, even in a linked worktree', () => {
  assert.deepEqual(resolvePorts({ ...WORKTREE, isCi: true }), BASE_PORTS);
});

test('a linked worktree gets three consecutive ports clear of the base ports', () => {
  const { dev, e2e, pwa } = resolvePorts(WORKTREE);
  assert.ok(dev >= 20_000 && pwa < 29_000);
  assert.deepEqual([e2e, pwa], [dev + 1, dev + 2]);
});

test('the same path always gets the same ports', () => {
  assert.deepEqual(resolvePorts(WORKTREE), resolvePorts({ ...WORKTREE }));
});

test('different paths get different ports', () => {
  assert.notDeepEqual(
    resolvePorts(WORKTREE),
    resolvePorts({ ...WORKTREE, root: '/repo/.claude/worktrees/b' }),
  );
});

test('the override replaces the slot and rejects anything out of range', () => {
  assert.deepEqual(resolvePorts({ ...WORKTREE, slotOverride: '1' }), {
    dev: 20_003,
    e2e: 20_004,
    pwa: 20_005,
  });
  for (const slotOverride of ['-1', '3000', '1.5', 'x']) {
    assert.throws(() => resolvePorts({ ...WORKTREE, slotOverride }), /MONOSAI_PORT_SLOT/);
  }
});
