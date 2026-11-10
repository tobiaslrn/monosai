import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compare, violationsOf } from './design-rules.mjs';

const component = (body) => `@Component({ selector: 'mn-x', ${body} }) export class X {}`;
const template = (html) => component(`template: \`${html}\``);
const styles = (css) => component(`template: '', styles: \`${css}\``);
const FEATURE = 'src/app/features/a.component.ts';

test('finds a native select in a template', () => {
  assert.deepEqual(violationsOf(FEATURE, template('<select><option>a</option></select>')), ['R20']);
  assert.deepEqual(violationsOf(FEATURE, template('<mn-select></mn-select>')), []);
});

test('finds an icon size outside the three roles and ignores the others', () => {
  assert.deepEqual(violationsOf(FEATURE, template('<mn-icon name="a" [size]="18" />')), ['R35']);
  assert.deepEqual(violationsOf(FEATURE, template('<mn-icon name="a" size="14" />')), ['R35']);
  assert.deepEqual(violationsOf(FEATURE, template('<mn-icon name="a" [size]="16" />')), []);
  assert.deepEqual(violationsOf(FEATURE, template('<mn-icon name="a" [size]="20" />')), []);
  assert.deepEqual(violationsOf(FEATURE, template('<mn-icon name="a" [size]="24" />')), []);
  assert.deepEqual(violationsOf(FEATURE, template('<mn-icon name="a" [size]="size()" />')), []);
  assert.deepEqual(violationsOf(FEATURE, template('<mn-icon name="a" />')), []);
});

test('finds a button inside a settings row, not beside one', () => {
  assert.deepEqual(
    violationsOf(
      FEATURE,
      template('<mn-settings-row label="a"><button mnButton>Go</button></mn-settings-row>'),
    ),
    ['R15'],
  );
  assert.deepEqual(
    violationsOf(
      FEATURE,
      template('<mn-settings-row label="a"></mn-settings-row><button mnButton>Go</button>'),
    ),
    [],
  );
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
  assert.match(compare(found, {}, null)[0], /R35 in docs\/design\/rules\.md/);
  assert.match(compare({}, { 'a.ts': ['R35'] }, null)[0], /remove it/);
  assert.match(compare(found, { 'a.ts': ['R35'] }, {})[0], /may only shrink/);
  assert.deepEqual(compare(found, { 'a.ts': ['R35'] }, { 'a.ts': ['R35'] }), []);
});
