import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  committedContract,
  committedVersion,
  contractNeedsRelease,
  releaseVersion,
} from './release-version.mjs';

test('bounded semantic versions increase across component boundaries', () => {
  assert.deepEqual(releaseVersion('0.1.0'), { code: 1000, name: '0.1.0', tag: 'bridge-v0.1.0' });
  assert.deepEqual(releaseVersion('bridge-v0.1.0'), releaseVersion('0.1.0'));
  assert.ok(releaseVersion('1.0.0').code > releaseVersion('0.999.999').code);
  for (const value of [
    'v1.2.3',
    '01.2.3',
    '1.2',
    '1.2.3-beta',
    '0.0.0',
    '2100.0.0',
    '1.1000.0',
    '1.0.1000',
    'bridge-v1.2.3-beta',
  ]) {
    assert.throws(() => releaseVersion(value));
  }
});

test('the committed version is one line, and nothing is silently trimmed', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'bridge-version-'));
  const write = async (contents) => {
    const path = join(directory, 'version.txt');
    await writeFile(path, contents);
    return path;
  };

  await t.test('reads a well-formed file', async () => {
    assert.equal((await committedVersion(await write('1.2.3\n'))).code, 1_002_003);
  });
  for (const contents of ['1.2.3', ' 1.2.3\n', '1.2.3 \n', '1.2.3\n\n', '\n']) {
    await t.test(`rejects ${JSON.stringify(contents)}`, async () => {
      const path = await write(contents);
      await assert.rejects(() => committedVersion(path));
    });
  }
});

test('a new contract only ships in a release that carries it', async (t) => {
  const at = (name, contract) => ({ version: releaseVersion(name), contract });

  await t.test('says nothing while the contract stands still', () => {
    assert.equal(contractNeedsRelease(at('0.1.0', 1), at('0.1.1', 1)), null);
  });
  await t.test('accepts a minor bump, including one that rolls the patch over', () => {
    assert.equal(contractNeedsRelease(at('0.1.0', 1), at('0.2.0', 2)), null);
    assert.equal(contractNeedsRelease(at('0.0.9', 0), at('0.1.0', 1)), null);
  });
  await t.test('accepts a major bump', () => {
    assert.equal(contractNeedsRelease(at('0.9.9', 1), at('1.0.0', 2)), null);
  });
  await t.test('refuses a contract hidden inside a patch release', () => {
    assert.match(contractNeedsRelease(at('0.1.0', 1), at('0.1.1', 2)), /minor bump/u);
  });
  await t.test('refuses a contract that moves backwards', () => {
    assert.match(contractNeedsRelease(at('0.1.0', 2), at('0.2.0', 1)), /only ever rise/u);
  });
});

test('the committed contract is one integer on one line', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'bridge-contract-'));
  const write = async (contents) => {
    const path = join(directory, 'contract.txt');
    await writeFile(path, contents);
    return path;
  };

  await t.test('reads a well-formed file', async () => {
    assert.equal(await committedContract(await write('2\n')), 2);
  });
  for (const contents of ['2', ' 2\n', '2 \n', '2\n\n', '\n', '0\n', '1.5\n', 'two\n']) {
    const path = await write(contents);
    await t.test(`rejects ${JSON.stringify(contents)}`, async () => {
      await assert.rejects(() => committedContract(path));
    });
  }
});
