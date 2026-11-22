import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  checkCitations,
  checkLineBudgets,
  checkedRules,
  compare,
  merge,
  violationsOf,
} from './design-rules.mjs';

const component = (body) => `@Component({ selector: 'mn-x', ${body} }) export class X {}`;
const template = (html) => component(`template: \`${html}\``);
const styles = (css) => component(`template: '', styles: \`${css}\``);
const FEATURE = 'src/app/features/a.component.ts';

test('finds an icon size outside the three roles and ignores the others', () => {
  assert.deepEqual(violationsOf(FEATURE, template('<mn-icon name="a" [size]="18" />')), ['R35']);
  assert.deepEqual(violationsOf(FEATURE, template('<mn-icon name="a" size="14" />')), ['R35']);
  assert.deepEqual(violationsOf(FEATURE, template('<mn-icon name="a" [size]="16" />')), []);
  assert.deepEqual(violationsOf(FEATURE, template('<mn-icon name="a" [size]="20" />')), []);
  assert.deepEqual(violationsOf(FEATURE, template('<mn-icon name="a" [size]="24" />')), []);
  assert.deepEqual(violationsOf(FEATURE, template('<mn-icon name="a" [size]="size()" />')), []);
  assert.deepEqual(violationsOf(FEATURE, template('<mn-icon name="a" />')), []);
});

test('finds a disable comment in features and core, not in shared-ui', () => {
  const silenced = template('<!-- eslint-disable-next-line x --><p>a</p>');
  assert.deepEqual(violationsOf(FEATURE, silenced), ['R6']);
  assert.deepEqual(violationsOf('src/app/core/a.ts', '/* stylelint-disable a */'), ['R6']);
  assert.deepEqual(violationsOf('src/app/shared-ui/a.component.ts', silenced), []);
  assert.deepEqual(violationsOf(FEATURE, template('<p>a</p>')), []);
});

test('finds transition: all in every spelling', () => {
  assert.deepEqual(violationsOf('src/styles/a.scss', 'a { transition: all 1s; }'), ['R44']);
  assert.deepEqual(violationsOf('src/styles/a.scss', 'a { transition-property: all; }'), ['R44']);
  assert.deepEqual(violationsOf('src/styles/a.scss', 'a { transition: opacity 1s, all 2s; }'), [
    'R44',
  ]);
  assert.deepEqual(violationsOf('src/styles/a.scss', 'a { transition: opacity 1s; }'), []);
  assert.deepEqual(violationsOf(FEATURE, styles(':host { transition: all 1s; }')), ['R44']);
});

test('finds a scale on press, in a rule or in a press mixin', () => {
  assert.deepEqual(violationsOf('src/styles/a.scss', '.b:active { transform: scale(0.97); }'), [
    'R40',
  ]);
  assert.deepEqual(violationsOf('src/styles/a.scss', '.b { &:active { scale: 0.9; } }'), ['R40']);
  assert.deepEqual(
    violationsOf('src/styles/_motion.scss', '@mixin press { transform: scale(0.9); }'),
    ['R40'],
  );
  assert.deepEqual(
    violationsOf('src/styles/a.scss', '.b:where(:active:not(:disabled)) { background: red; }'),
    [],
  );
  assert.deepEqual(violationsOf('src/styles/a.scss', '.b { transform: scale(1.1); }'), []);
});

test('finds a colour literal everywhere except the tokens', () => {
  assert.deepEqual(violationsOf('src/styles/a.scss', 'a { color: #fff; }'), ['R39']);
  assert.deepEqual(
    violationsOf('src/styles/a.scss', 'a { box-shadow: 0 0 1px rgb(0 0 0 / 5%); }'),
    ['R39'],
  );
  assert.deepEqual(violationsOf(FEATURE, styles(':host { background: hsl(1 2% 3%); }')), ['R39']);
  assert.deepEqual(violationsOf(FEATURE, template('<p style="color: #123456">x</p>')), ['R39']);
  assert.deepEqual(violationsOf('src/styles/_tokens.scss', ':root { --a: #fff; }'), []);
  assert.deepEqual(
    violationsOf('src/styles/a.scss', 'a { color: var(--text-primary); } #id { margin: 0 }'),
    [],
  );
  assert.deepEqual(violationsOf(FEATURE, template('<a href="#main">x</a>')), []);
});

test('holds the exemptions to a list that only shrinks', () => {
  const found = { 'a.ts': ['R35'] };
  assert.deepEqual(compare(found, { 'a.ts': ['R35'] }, null), []);
  assert.match(compare(found, {}, null)[0], /\. Fix: .*\(R35 in docs\/design\/rules\.md\)$/);
  assert.match(compare({}, { 'a.ts': ['R35'] }, null)[0], /no longer breaks R35\. Fix: remove/);
  assert.match(compare(found, { 'a.ts': ['R35'] }, {})[0], /may only shrink/);
  assert.deepEqual(compare(found, { 'a.ts': ['R35'] }, { 'a.ts': ['R35'] }), []);
});

test('lets the commit that adds a check seed its exemptions, and no later one', () => {
  const found = { 'a.ts': ['R52'], 'b.ts': ['R35'] };
  const exemptions = { 'a.ts': ['R52'], 'b.ts': ['R35'] };
  // R52 was not checked at the base revision, so its entry may be new; R35 was.
  const errors = compare(found, exemptions, {}, new Set(['R35']));
  assert.equal(errors.length, 1);
  assert.match(errors[0], /gained R35 for b\.ts/);
  // Once the base checks R52, a new entry for it fails too.
  assert.equal(compare(found, exemptions, {}, new Set(['R35', 'R52'])).length, 2);
  assert.deepEqual(
    checkedRules(
      JSON.stringify([
        { rule: 'R2', status: 'checked' },
        { rule: 'R9', status: 'retired' },
      ]),
    ),
    new Set(['R2']),
  );
});

test('prints the messages a scan or the lint gave, merged by file and rule', () => {
  const found = merge(
    { 'a.ts': { R35: ['a.ts sets an icon size'] } },
    { 'a.ts': { R15: ['a.ts:3:1 A button sits inside a row'] } },
  );
  assert.deepEqual(compare(found, { 'a.ts': ['R35'] }, null), [
    'a.ts:3:1 A button sits inside a row',
  ]);
});

test('holds every cited rule to the rulebook or the retired list', () => {
  const rulebook = '**R2.** Compose.\n\n**R15. Rows.** The row is the control.\n';
  const checks = [
    { rule: 'R2', status: 'checked' },
    { rule: 'R15', status: 'checked' },
    { rule: 'R30', status: 'retired' },
  ];
  assert.deepEqual(checkCitations(rulebook, checks, ['R2', 'R15']), []);
  assert.match(checkCitations(rulebook, checks, ['R7'])[0], /cites R7, which .* does not list/);
  assert.match(checkCitations(rulebook, checks, ['R30'])[0], /lists as retired/);
  assert.match(
    checkCitations('**R2.** Compose.', checks, [])[0],
    /checks R15, but docs\/design\/rules\.md has no "\*\*R15\.\*\*"/,
  );
  assert.match(checkCitations(rulebook, [{ rule: 'R2', status: 'maybe' }], [])[0], /"maybe"/);
});

test('holds the always-loaded guidance to its line budget', async () => {
  const root = await mkdtemp(join(tmpdir(), 'design-rules-'));
  await writeFile(join(root, 'AGENTS.md'), 'a\nb\nc\n');
  await writeFile(join(root, 'rules.md'), 'a\n');
  assert.deepEqual(await checkLineBudgets(root, { 'AGENTS.md': 3, 'rules.md': 1 }), []);
  const errors = await checkLineBudgets(root, { 'AGENTS.md': 2, 'rules.md': 1 });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^AGENTS\.md has 3 lines, over its budget of 2\. Fix: .*\(R5 in/);
});
