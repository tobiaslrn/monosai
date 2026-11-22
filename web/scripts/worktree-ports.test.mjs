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

test('the screenshot suites get two more ports, clear of every slot of the first three', () => {
  const { visual, shots } = resolvePorts(WORKTREE);
  assert.ok(visual >= 29_000 && shots < 35_000);
  assert.equal(shots, visual + 1);
  assert.deepEqual(resolvePorts({ ...WORKTREE, slotOverride: '2999' }), {
    dev: 28_997,
    e2e: 28_998,
    pwa: 28_999,
    visual: 34_998,
    shots: 34_999,
  });
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
    visual: 29_002,
    shots: 29_003,
  });
  for (const slotOverride of ['-1', '3000', '1.5', 'x']) {
    assert.throws(() => resolvePorts({ ...WORKTREE, slotOverride }), /MONOSAI_PORT_SLOT/);
  }
});
