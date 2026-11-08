import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compare, violationsOf } from './composition-freeze.mjs';

const component = (body) => `@Component({ selector: 'mn-x', ${body} }) export class X {}`;

test('finds owned styles in every form', () => {
  assert.deepEqual(
    violationsOf('src/app/features/a.component.ts', component('styles: `:host {}`')),
    ['styles'],
  );
  assert.deepEqual(
    violationsOf('src/app/features/a.component.ts', component("styles: [':host {}']")),
    ['styles'],
  );
  assert.deepEqual(
    violationsOf('src/app/features/a.component.ts', component("styleUrl: './a.scss'")),
    ['styles'],
  );
  assert.deepEqual(violationsOf('src/app/core/a.component.scss', ':host {}'), ['styles']);
  assert.deepEqual(
    violationsOf('src/app/features/a.component.ts', component('template: `<p>x</p>`')),
    [],
  );
});

test('finds a native popover attribute but not prose about popovers', () => {
  const attribute = component(
    'template: `<mn-sheet\n  id="x"\n  popover\n  role="dialog"></mn-sheet>`',
  );
  const binding = component('template: `<div [popover]="mode"></div>`');
  const prose = component('template: `<p>Controls in the popover and the sheet.</p>`');
  assert.deepEqual(violationsOf('src/app/features/a.ts', attribute), ['popover']);
  assert.deepEqual(violationsOf('src/app/features/a.ts', binding), ['popover']);
  assert.deepEqual(violationsOf('src/app/features/a.ts', prose), []);
  assert.deepEqual(violationsOf('src/app/features/a.html', '<div popover="manual"></div>'), [
    'popover',
  ]);
});

test('finds raw details in templates only', () => {
  assert.deepEqual(
    violationsOf(
      'src/app/features/a.ts',
      component('template: `<details><summary>x</summary></details>`'),
    ),
    ['details'],
  );
  assert.deepEqual(violationsOf('src/app/features/a.ts', '// a <details> in a comment'), []);
});

test('allows PopoverService only in the reader', () => {
  const source = 'private readonly popover = inject(PopoverService);';
  assert.deepEqual(violationsOf('src/app/features/library/a.ts', source), ['popover-service']);
  assert.deepEqual(violationsOf('src/app/features/reader/a.ts', source), []);
});

test('the allowlist covers what exists, nothing more, and only shrinks', () => {
  const found = { 'a.ts': ['styles'] };
  assert.deepEqual(compare(found, { 'a.ts': ['styles'] }, { 'a.ts': ['styles'] }), []);
  assert.match(compare({ 'b.ts': ['details'] }, {}, {})[0], /^b\.ts uses a raw <details>/);
  assert.match(compare({}, { 'a.ts': ['styles'] }, null)[0], /no longer breaks "styles"/);
  assert.match(compare(found, { 'a.ts': ['styles'] }, {})[0], /may only shrink/);
  assert.deepEqual(compare(found, { 'a.ts': ['styles'] }, null), []);
});
