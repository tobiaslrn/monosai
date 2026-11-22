import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { playwrightImage } from './visual.mjs';

const workflow = (name) =>
  readFileSync(new URL(`../../.github/workflows/${name}`, import.meta.url), 'utf8');

test('the image is the Playwright release the lockfile pins', () => {
  const lockfile = JSON.stringify({
    packages: { 'node_modules/@playwright/test': { version: '1.2.3' } },
  });
  assert.equal(playwrightImage(lockfile), 'mcr.microsoft.com/playwright:v1.2.3-noble');
  assert.throws(() => playwrightImage('{"packages":{}}'), /does not pin/);
});

test('both workflows compare and draw baselines in that image', () => {
  // A baseline drawn in one image and compared in another fails on fonts alone.
  for (const name of ['ci.yml', 'visual-baselines.yml']) {
    assert.ok(
      workflow(name).includes(`image: ${playwrightImage()}`),
      `${name} must run its visual job in ${playwrightImage()}`,
    );
  }
});
