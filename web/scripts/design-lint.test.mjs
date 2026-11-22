// Each design-lint selector fires on a bad template and stays quiet on a good one.
// The template AST's node names change across Angular versions (`Element$1`
// became `Element`); a selector that no longer matches would pass silently, so
// every selector has a fixture here.

import assert from 'node:assert/strict';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { CONFIG } from './design-lint.mjs';
import { SCRIPT_RESTRICTIONS, TEMPLATE_RESTRICTIONS, ruleOf } from './design-lint-rules.mjs';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const eslint = new ESLint({ cwd: webRoot, overrideConfigFile: join(webRoot, CONFIG) });
const FEATURE = join(webRoot, 'src/app/features/fixture/fixture.component.ts');

const component = (template, body = '') =>
  `import { Component } from '@angular/core';\n` +
  `@Component({ selector: 'mn-fixture', template: \`${template}\` })\n` +
  `export class FixtureComponent {\n${body}\n}\n`;

/** The messages the design lint gives a file, as `R15: <message>`. */
async function lint(source, filePath = FEATURE) {
  const [result] = await eslint.lintText(source, { filePath });
  const fatal = result.messages.find((message) => message.fatal);
  assert.equal(fatal, undefined, fatal?.message);
  return result.messages
    .filter((message) => message.ruleId === 'no-restricted-syntax')
    .map((message) => `${String(ruleOf(message.message))}: ${message.message}`);
}

const templateRules = async (template) =>
  (await lint(component(template))).map((message) => message.slice(0, message.indexOf(':'))).sort();

const row = (inside) => `<mn-settings-row label="Voice" end="choice">${inside}</mn-settings-row>`;

test('every message says what is wrong, the fix and the rule', () => {
  for (const { message } of [...TEMPLATE_RESTRICTIONS, ...SCRIPT_RESTRICTIONS]) {
    assert.match(message, /\. Fix: .+\. \(R\d+ in docs\/design\/rules\.md\)$/);
  }
});

test('R15: a settings row holds no button', async () => {
  assert.deepEqual(await templateRules(row('<button type="button">Go</button>')), ['R15']);
  assert.deepEqual(await templateRules(row('<a mnButton href="/x">Go</a>')), ['R15']);
  assert.deepEqual(await templateRules(row('<a [mnButton]="kind" href="/x">Go</a>')), ['R15']);
  assert.deepEqual(
    await templateRules(row('@if (ready) { <span><button type="button">Go</button></span> }')),
    ['R15'],
  );
  assert.deepEqual(await templateRules(`${row('')}<button mnButton type="button">Go</button>`), []);
});

test('R15: a settings row holds no field or boxed select', async () => {
  for (const field of [
    '<input type="text" />',
    '<textarea></textarea>',
    '<mn-field label="Name"><input /></mn-field>',
    '<mn-search-field label="Find" />',
    '<mn-secret-field label="Key" />',
    '<mn-range-field label="Speed" />',
  ]) {
    assert.ok((await templateRules(row(field))).includes('R15'), field);
  }
  assert.deepEqual(await templateRules(row('<select></select>')), ['R15', 'R20']);
  assert.deepEqual(await templateRules(row('<mn-select label="Voice" />')), []);
  assert.deepEqual(await templateRules(row('<mn-segmented-control label="Theme" />')), []);
  assert.deepEqual(await templateRules(row('<span mn-settings-row-detail>More</span>')), []);
});

test('R15: a settings row holds no status pill', async () => {
  assert.deepEqual(await templateRules(row('<span class="mn-status-pill">Ready</span>')), ['R15']);
  assert.deepEqual(
    await templateRules(row('<span class="x mn-status-pill--success">Ready</span>')),
    ['R15'],
  );
  assert.deepEqual(await templateRules(row('<span [class.mn-status-pill]="on">Ready</span>')), [
    'R15',
  ]);
  assert.deepEqual(await templateRules(`${row('')}<span class="mn-status-pill">Ready</span>`), []);
});

test('R20: no native select anywhere', async () => {
  assert.deepEqual(await templateRules('<select><option>a</option></select>'), ['R20']);
  assert.deepEqual(await templateRules('<mn-select label="a" />'), []);
});

test("R2: no primitive's internal class outside shared-ui", async () => {
  assert.deepEqual(await templateRules('<span class="mn-dropdown-row__check"></span>'), ['R2']);
  assert.deepEqual(await templateRules('<span class="a mn-standing__clause"></span>'), ['R2']);
  assert.deepEqual(await templateRules('<span [class.mn-button__badge]="on"></span>'), ['R2']);
  assert.deepEqual(await templateRules('<span class="mn-status-line mn-hint"></span>'), []);
  assert.deepEqual(await templateRules('<span [attr.title]="a__b"></span>'), []);
});

test('R54: template text has no em dash, "!", "&" or three dots', async () => {
  assert.deepEqual(await templateRules('<p>Saved — nothing lost</p>'), ['R54']);
  assert.deepEqual(await templateRules('<p>Saved!</p>'), ['R54']);
  assert.deepEqual(await templateRules('<p>Words &amp; grammar</p>'), ['R54']);
  assert.deepEqual(await templateRules('<p>Loading...</p>'), ['R54']);
  assert.deepEqual(await templateRules('<p>Loading…</p>'), []);
  assert.deepEqual(await templateRules('<p>Saved · 3 words</p>'), []);
  assert.deepEqual(await templateRules("<p [title]=\"a ? 'Hi!' : '—'\">{{ a }}</p>"), []);
  assert.deepEqual(await templateRules('@if (!busy && done) { <p>Done</p> }'), []);
  assert.deepEqual(await templateRules('<!-- a note — for readers! --><p>Done</p>'), []);
});

test('R52: a confirm label is a verb, never OK, Yes, Continue or Really', async () => {
  const confirm = (label) =>
    component('', `open() { return openConfirmDialog(this.dialog, { confirmLabel: ${label} }); }`);
  for (const label of ["'OK'", "'Yes, delete'", "'Continue'", "'Really delete'", '`Continue`']) {
    const messages = await lint(confirm(label));
    assert.equal(messages.length, 1, label);
    assert.match(messages[0], /^R52: /);
  }
  assert.deepEqual(await lint(confirm("a ? 'Delete' : 'OK'")).then((m) => m.length), 1);
  assert.deepEqual(await lint(confirm("'Delete'")), []);
  assert.deepEqual(await lint(confirm("'Delete everything'")), []);
  assert.deepEqual(await lint(component('', "label = { cancelLabel: 'OK' };")), []);
});

test('a disable comment cannot silence a design rule', async () => {
  const template = '<!-- eslint-disable-next-line no-restricted-syntax -->\n<select></select>';
  assert.deepEqual(await templateRules(template), ['R20']);
});

test('shared-ui and specs are outside the design lint', async () => {
  const source = component('<select></select>');
  const [shared] = await eslint.lintText(source, {
    filePath: join(webRoot, 'src/app/shared-ui/fixture/fixture.component.ts'),
  });
  assert.deepEqual(
    shared.messages.filter((message) => message.ruleId === 'no-restricted-syntax'),
    [],
  );
  const [spec] = await eslint.lintText(source, {
    filePath: join(webRoot, 'src/app/features/fixture/fixture.component.spec.ts'),
  });
  assert.deepEqual(
    spec.messages.filter((message) => message.ruleId === 'no-restricted-syntax'),
    [],
  );
});
