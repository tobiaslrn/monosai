// Features and core compose shared-ui; they do not style or float things
// themselves. This scan finds the constructs that bypass the primitives and
// holds them to a checked-in allowlist that may only shrink: a new use fails,
// an allowlisted use that is gone fails until its entry is removed, and an
// entry added since the base revision fails.

import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

export const ALLOWLIST_PATH = 'scripts/composition-allowlist.json';

export const RULES = {
  styles: 'owns styles (a `styles:` block, `styleUrl`, or a .scss file); compose shared-ui instead',
  popover: 'uses a native `[popover]`; use mn-menu or mn-dialog',
  details: 'uses a raw <details>; use a shared-ui disclosure',
  'popover-service': 'uses PopoverService outside the reader; use mn-menu or mn-dialog',
};

const scannedRoots = ['src/app/features', 'src/app/core'];
const readerRoot = 'src/app/features/reader/';

/** Inline templates of a component file, or the whole file for .html. */
function templatesOf(path, source) {
  if (extname(path) === '.html') return [source];
  return [...source.matchAll(/\btemplate\s*:\s*`([\s\S]*?)`/g)].map((match) => match[1]);
}

/** The rule ids a single source file breaks; `path` is relative to web/. */
export function violationsOf(path, source) {
  const found = new Set();
  const extension = extname(path);

  if (extension === '.scss') found.add('styles');
  if (extension === '.ts') {
    if (/\bstyles\s*:\s*[[`'"]/.test(source) || /\bstyleUrls?\s*:/.test(source))
      found.add('styles');
    if (/\bPopoverService\b/.test(source) && !path.startsWith(readerRoot))
      found.add('popover-service');
  }

  for (const template of templatesOf(path, source)) {
    // An attribute inside a tag, so prose that mentions "the popover" does not count.
    if (/<[a-z][^<>]*\s\[?popover\]?(?=[\s=>/])/i.test(template)) found.add('popover');
    if (/<details\b/i.test(template)) found.add('details');
  }

  return [...found].sort();
}

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collect(path)));
    else if (/\.(ts|html|scss)$/.test(entry.name) && !/\.spec\.ts$/.test(entry.name))
      files.push(path);
  }
  return files;
}

/** Every violation under features/ and core/, keyed by web-relative path. */
export async function scan(webRoot) {
  const result = {};
  for (const root of scannedRoots) {
    for (const file of await collect(join(webRoot, root))) {
      const path = relative(webRoot, file).replaceAll('\\', '/');
      const rules = violationsOf(path, await readFile(file, 'utf8'));
      if (rules.length > 0) result[path] = rules;
    }
  }
  return result;
}

/**
 * Compares a scan with the allowlist and, when given, the allowlist at the base
 * revision. Returns human-readable errors; an empty list passes.
 */
export function compare(found, allowlist, baseAllowlist) {
  const errors = [];
  for (const [path, rules] of Object.entries(found)) {
    for (const rule of rules) {
      if (!allowlist[path]?.includes(rule)) errors.push(`${path} ${RULES[rule]}.`);
    }
  }
  for (const [path, rules] of Object.entries(allowlist)) {
    for (const rule of rules) {
      if (!found[path]?.includes(rule)) {
        errors.push(`${path} no longer breaks "${rule}": remove it from ${ALLOWLIST_PATH}.`);
      }
    }
  }
  if (baseAllowlist) {
    for (const [path, rules] of Object.entries(allowlist)) {
      for (const rule of rules) {
        if (!baseAllowlist[path]?.includes(rule)) {
          errors.push(
            `${ALLOWLIST_PATH} gained "${rule}" for ${path}; the allowlist may only shrink.`,
          );
        }
      }
    }
  }
  return errors;
}

/**
 * The allowlist at the base revision: COMPOSITION_BASE_REF when set (CI),
 * otherwise the merge base with origin/main. Null when git cannot tell, or
 * when the base predates the allowlist.
 */
export function readBaseAllowlist(webRoot) {
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: webRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  const required = Boolean(process.env.COMPOSITION_BASE_REF);
  let base;
  try {
    base = git(
      'rev-parse',
      '--verify',
      `${process.env.COMPOSITION_BASE_REF || git('merge-base', 'HEAD', 'origin/main')}^{commit}`,
    );
  } catch {
    // CI names the base on purpose, so an unknown base there is an error, not a skip.
    if (required)
      throw new Error(
        `COMPOSITION_BASE_REF ${process.env.COMPOSITION_BASE_REF} is not a known commit.`,
      );
    return null;
  }
  try {
    return JSON.parse(git('show', `${base}:web/${ALLOWLIST_PATH}`));
  } catch {
    return null;
  }
}

export async function checkComposition(webRoot) {
  const allowlist = JSON.parse(await readFile(join(webRoot, ALLOWLIST_PATH), 'utf8'));
  return compare(await scan(webRoot), allowlist, readBaseAllowlist(webRoot));
}
