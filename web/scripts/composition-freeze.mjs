// Features and core compose shared-ui; they do not style or float things
// themselves. This scan finds the constructs that bypass the primitives and
// holds them to a checked-in allowlist that may only shrink: a new use fails,
// an allowlisted use that is gone fails until its entry is removed, and an
// entry added since the base revision fails.

import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

export const ALLOWLIST_PATH = 'scripts/composition-allowlist.json';

/** What each construct breaks: what is wrong, the fix, and the rule in docs/design/rules.md. */
export const RULES = {
  styles:
    'owns styles (a `styles:` block, `styleUrl`, or a .scss file). Fix: compose ' +
    'web/src/app/shared-ui/ primitives; a missing visual need changes or adds a primitive ' +
    'for every use. (R2 in docs/design/rules.md)',
  popover:
    'uses a native `[popover]`. Fix: use mn-menu for commands, mn-select for a value, or ' +
    'mn-dialog for a task. (R28 in docs/design/rules.md)',
  details:
    'uses a raw <details>. Fix: use mn-disclosure from web/src/app/shared-ui/. ' +
    '(R2 in docs/design/rules.md)',
  'popover-service':
    'uses PopoverService outside the reader. Fix: use mn-menu, mn-select or mn-dialog. ' +
    '(R28 in docs/design/rules.md)',
};

const scannedRoots = ['src/app/features', 'src/app/core'];
const readerRoot = 'src/app/features/reader/';

/** Inline templates of a component file, or the whole file for .html. */
export function templatesOf(path, source) {
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

/** Keeps the entries of a path-keyed object whose path is in `paths`; all of it when null. */
export function only(object, paths) {
  if (!object || !paths) return object;
  return Object.fromEntries(Object.entries(object).filter(([path]) => paths.includes(path)));
}

/**
 * Every violation under features/ and core/, keyed by web-relative path. With
 * `paths` (web-relative), only those files are read.
 */
export async function scan(webRoot, paths = null) {
  const files = paths
    ? paths
        .filter((path) => scannedRoots.some((root) => path.startsWith(`${root}/`)))
        .filter((path) => /\.(ts|html|scss)$/.test(path) && !/\.spec\.ts$/.test(path))
        .map((path) => join(webRoot, path))
    : (await Promise.all(scannedRoots.map((root) => collect(join(webRoot, root))))).flat();
  const result = {};
  for (const file of files) {
    const path = relative(webRoot, file).replaceAll('\\', '/');
    let source;
    try {
      source = await readFile(file, 'utf8');
    } catch {
      continue; // A changed file that was deleted.
    }
    const rules = violationsOf(path, source);
    if (rules.length > 0) result[path] = rules;
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
      if (!allowlist[path]?.includes(rule)) errors.push(`${path} ${RULES[rule]}`);
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
            `${ALLOWLIST_PATH} gained "${rule}" for ${path}; the allowlist may only shrink. ` +
              'Fix: remove the entry and compose shared-ui instead. (R2 in docs/design/rules.md)',
          );
        }
      }
    }
  }
  return errors;
}

/**
 * A file at the base revision: COMPOSITION_BASE_REF when set (CI), otherwise the
 * merge base with origin/main. Null when git cannot tell, or when the file did
 * not exist there. `path` is relative to web/.
 */
export function readBaseFile(webRoot, path) {
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
    return git('show', `${base}:web/${path}`);
  } catch {
    return null;
  }
}

/** The allowlist at the base revision, or null when there is none to compare with. */
export function readBaseAllowlist(webRoot, allowlistPath = ALLOWLIST_PATH) {
  const text = readBaseFile(webRoot, allowlistPath);
  try {
    return text === null ? null : JSON.parse(text);
  } catch {
    return null;
  }
}

/** The composition errors of the whole tree, or of `paths` (web-relative) only. */
export async function checkComposition(webRoot, paths = null) {
  const allowlist = JSON.parse(await readFile(join(webRoot, ALLOWLIST_PATH), 'utf8'));
  return compare(
    await scan(webRoot, paths),
    only(allowlist, paths),
    only(readBaseAllowlist(webRoot), paths),
  );
}
