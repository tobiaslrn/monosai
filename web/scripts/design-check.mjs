#!/usr/bin/env node
// `npm run design:check`: every design check, in one fast run. Each failure says
// what is wrong, the fix (the primitive or token to use) and the rule in
// docs/design/rules.md. docs/design/checks.md lists what is checked.
//
//   node scripts/design-check.mjs                     the whole tree
//   node scripts/design-check.mjs --changed <path>…   only those files (the Stop hook)
//   node scripts/design-check.mjs --timings           also print how long each part took
//
// Paths may be relative to the repository or to web/.

import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkAndroidColours } from './android-colours.mjs';
import { checkComposition, only } from './composition-freeze.mjs';
import { checkPage, readChecks } from './design-checks-doc.mjs';
import { lintDesign } from './design-lint.mjs';
import {
  RULEBOOK,
  checkCitations,
  checkLineBudgets,
  checkRulebook,
  compare,
  merge,
  readBaseExemptions,
  readBaseRules,
  readExemptions,
  scan,
} from './design-rules.mjs';
import { lintStyles } from './stylelint-components.mjs';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(webRoot, '..');

/** The sources whose messages cite rules, read for the citation check. */
const CITING_SOURCES = [
  'scripts/android-colours.mjs',
  'scripts/composition-freeze.mjs',
  'scripts/design-checks-doc.mjs',
  'scripts/design-lint-rules.mjs',
  'scripts/design-rules.mjs',
  'scripts/stylelint-components.mjs',
  'stylelint.config.mjs',
];

/** Every rule number the check sources cite. */
export function citedRules(source) {
  const pattern =
    /cite\('(R\d+)'\)|restriction\(\s*'(R\d+)'|\((R\d+) in docs\/design\/rules\.md\)|^\s+(R\d+):|\['[^']*', '(R\d+)'\]/gm;
  return [...source.matchAll(pattern)].map((match) => match.slice(1).find(Boolean));
}

async function rulesAndLint(paths) {
  const [found, lint] = await Promise.all([scan(webRoot, paths), lintDesign(webRoot, paths)]);
  merge(found, lint.found);
  return [
    ...lint.errors,
    ...compare(
      found,
      only(await readExemptions(webRoot), paths),
      only(readBaseExemptions(webRoot), paths),
      readBaseRules(webRoot),
    ),
  ];
}

async function citations() {
  const sources = await Promise.all(
    CITING_SOURCES.map((path) => readFile(join(webRoot, path), 'utf8')),
  );
  return checkCitations(
    await readFile(join(repoRoot, RULEBOOK), 'utf8'),
    await readChecks(webRoot),
    sources.flatMap(citedRules),
  );
}

/** Runs every part; `paths` (web-relative) narrows the file scans to those files. */
export async function runDesignCheck(paths = null) {
  const timed = async (name, work) => {
    const start = performance.now();
    const errors = await work();
    return { name, errors, ms: performance.now() - start };
  };
  return Promise.all([
    timed('rules and template lint', () => rulesAndLint(paths)),
    timed('composition', () => checkComposition(webRoot, paths)),
    timed('styles', () => lintStyles(paths)),
    timed('android colours', () => checkAndroidColours(repoRoot)),
    timed('rulebook', async () => [
      ...(await checkRulebook(repoRoot)),
      ...(await checkLineBudgets(repoRoot)),
      ...(await citations()),
    ]),
    timed('checks page', () => checkPage(webRoot)),
  ]);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const changed = args.includes('--changed')
    ? args
        .filter((arg) => !arg.startsWith('--'))
        .map((path) => path.replaceAll('\\', '/').replace(/^web\//, ''))
    : null;
  const start = performance.now();
  const parts = await runDesignCheck(changed);
  const seconds = ((performance.now() - start) / 1000).toFixed(1);
  if (args.includes('--timings')) {
    for (const part of parts) console.log(`  ${part.name}: ${String(Math.round(part.ms))} ms`);
  }
  const errors = parts.flatMap((part) => part.errors);
  if (errors.length > 0) {
    console.error(
      `Design check: ${String(errors.length)} problem(s). Each says what is wrong, the fix, ` +
        `and the rule in ${RULEBOOK}; docs/design/checks.md lists every check.\n` +
        errors.map((error) => `  ${error}`).join('\n'),
    );
    process.exit(1);
  }
  console.log(`Design check: ok (${seconds} s).`);
}
