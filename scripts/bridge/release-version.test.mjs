import { test } from 'node:test';
import assert from 'node:assert/strict';
import { releaseVersion } from './release-version.mjs';

test('bounded semantic versions increase across component boundaries', () => {
  assert.deepEqual(releaseVersion('bridge-v0.1.0'), { code: 1000, name: '0.1.0' });
  assert.ok(releaseVersion('bridge-v1.0.0').code > releaseVersion('bridge-v0.999.999').code);
  for (const tag of [
    'v1.2.3',
    'bridge-v01.2.3',
    'bridge-v1.2',
    'bridge-v1.2.3-beta',
    'bridge-v0.0.0',
    'bridge-v2100.0.0',
    'bridge-v1.1000.0',
    'bridge-v1.0.1000',
  ]) {
    assert.throws(() => releaseVersion(tag));
  }
});
