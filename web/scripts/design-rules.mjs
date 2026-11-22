// The design rulebook, `docs/design/rules.md`, is binding. This scan holds the
// rules that a regular expression checks cheaply and reliably; the rules that
// need a syntax tree are in design-lint-rules.mjs. Both fail with what is wrong,
// the fix and the rule's number, and share one exemption list that may only
// shrink: a new use fails, an exemption whose use is gone fails until it is
// removed, and an entry added since the base revision fails, unless its rule
// was not checked at the base revision (the commit that adds a check seeds it).
// `npm run design:check` (design-check.mjs) runs this with every other check.

import { readFile, readdir } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { readBaseFile, templatesOf } from './composition-freeze.mjs';
import { cite } from './design-lint-rules.mjs';

export const EXEMPTIONS_PATH = 'scripts/design-rules-exemptions.json';
export const CHECKS_PATH = 'scripts/design-checks.json';
export const RULEBOOK = 'docs/design/rules.md';

/**
 * The three icon-size roles, in pixels. `mn-icon` takes only these names as
 * its `size`, and `ICON_SIZES` in its component must say the same.
 */
export const ICON_SIZES = { inline: 16, control: 20, feature: 24 };
export const ICON_COMPONENT = 'src/app/shared-ui/icon/icon.component.ts';

const ICON_ROLES = Object.entries(ICON_SIZES)
  .map(([role, pixels]) => `${role} ${String(pixels)}px`)
  .join(', ');

/** What each guard here finds, and its fix; the key is the rule number in the rulebook. */
export const RULES = {
  R6:
    'silences a check with an eslint-disable or stylelint-disable comment. Fix: meet the rule, ' +
    'or report the conflict; features and core carry no disable comments',
  R35:
    `sizes an icon outside the three roles (${ICON_ROLES}). Fix: pass a role as the mn-icon ` +
    '`size` (or drop it for control); never legacySize or a stylesheet size',
  R39:
    'writes a colour literal outside _tokens.scss. Fix: use a colour token from ' +
    'web/src/styles/_tokens.scss',
  R40:
    'scales on press. Fix: a press changes colour only; remove the scale and use the ' +
    'state layer',
  R44:
    'writes `transition: all`. Fix: include a named motion from web/src/styles/_motion.scss, ' +
    'which names its properties',
};

const SOURCE = /\.(ts|html|scss)$/;
const COLOUR_LITERAL = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/i;
const DISABLE_COMMENT = /\b(?:eslint|stylelint)-disable\b/;
const SCANNED_ROOTS = ['src/app', 'src/styles'];

async function collect(directory, pattern = SOURCE) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collect(path, pattern)));
    else if (pattern.test(entry.name) && !/\.spec\.ts$/.test(entry.name)) files.push(path);
  }
  return files;
}

/** The text of every stylesheet in a file: the file itself, or its `styles:` blocks. */
function stylesOf(path, source) {
  if (extname(path) === '.scss') return [source];
  if (extname(path) !== '.ts') return [];
  return [...source.matchAll(/\bstyles\s*:\s*(?:\[\s*)?`([\s\S]*?)`/g)].map((match) => match[1]);
}

/** Each `{ … }` block as its header (the text before the brace) and its body. */
function blocksOf(css) {
  const blocks = [];
  const open = [];
  let start = 0;
  for (let index = 0; index < css.length; index++) {
    const char = css[index];
    if (char === '{') {
      open.push({ header: css.slice(start, index).trim(), bodyStart: index + 1 });
      start = index + 1;
    } else if (char === '}') {
      const block = open.pop();
      if (block) blocks.push({ header: block.header, body: css.slice(block.bodyStart, index) });
      start = index + 1;
    } else if (char === ';') {
      start = index + 1;
    }
  }
  return blocks;
}

/** The rule ids a stylesheet breaks, except colour literals, which depend on the file. */
function styleViolations(css) {
  const found = new Set();
  if (/\btransition(?:-property)?\s*:[^;{}]*\ball\b/i.test(css)) found.add('R44');
  for (const { header, body } of blocksOf(css)) {
    const press = /:active\b|@mixin\s+press/i.test(header);
    if (press && /\bscale\s*\(|(?:^|[;\s{])scale\s*:/i.test(body)) found.add('R40');
    // A glyph resized by a stylesheet rather than by its role.
    if (
      /\bsvg\b/i.test(header) &&
      /(?:^|[;\s{])(?:width|height|inline-size|block-size)\s*:/i.test(body)
    )
      found.add('R35');
  }
  return found;
}

/**
 * Whether an mn-icon tag sizes itself outside the roles: a bound pixel `size`,
 * a static `size` that names no role, or the deprecated `legacySize` set to a
 * number. The type of `size` already refuses anything but a role; this also
 * catches what the template type check lets through.
 */
function iconSizeViolates(tag) {
  for (const [, bound, value] of tag.matchAll(/(\[)?\bsize\]?\s*=\s*"([^"]*)"/g)) {
    if (bound ? /^\s*\d+\s*$/.test(value) : !Object.hasOwn(ICON_SIZES, value)) return true;
  }
  return /\[?\blegacySize\]?\s*=\s*"\s*\d+\s*"/.test(tag);
}

function hasColourLiteral(css) {
  for (const match of css.matchAll(/(?:^|[;{\s])(?:--)?[a-z-]+\s*:\s*([^;{}]+)/gi)) {
    if (COLOUR_LITERAL.test(match[1])) return true;
  }
  return false;
}

/** The rule ids a single source file breaks; `path` is relative to web/. */
export function violationsOf(path, source) {
  const found = new Set();
  const isTokens = /(^|\/)_tokens\.scss$/.test(path);
  const inApp = path.startsWith('src/app/');
  const composed = /^src\/app\/(features|core)\//.test(path);

  for (const css of stylesOf(path, source)) {
    for (const rule of styleViolations(css)) found.add(rule);
    if (!isTokens && hasColourLiteral(css)) found.add('R39');
  }

  if (composed && DISABLE_COMMENT.test(source)) found.add('R6');

  if (inApp && extname(path) !== '.scss') {
    for (const template of templatesOf(path, source)) {
      for (const tag of template.matchAll(/<mn-icon\b[^>]*>/g)) {
        if (iconSizeViolates(tag[0])) found.add('R35');
      }
      for (const style of template.matchAll(/\sstyle\s*=\s*"([^"]*)"/g)) {
        if (COLOUR_LITERAL.test(style[1])) found.add('R39');
      }
    }
  }

  return [...found].sort();
}

/** Whether a web-relative path is one this scan reads. */
export function isScanned(path) {
  return (
    SCANNED_ROOTS.some((root) => path.startsWith(`${root}/`)) &&
    SOURCE.test(path) &&
    !/\.spec\.ts$/.test(path)
  );
}

/**
 * Every violation under src/app and src/styles, keyed by web-relative path, as
 * `{ [path]: { [rule]: [message, …] } }`. With `paths`, only those files are read.
 */
export async function scan(webRoot, paths = null) {
  const files = paths
    ? paths.filter(isScanned).map((path) => join(webRoot, path))
    : (await Promise.all(SCANNED_ROOTS.map((root) => collect(join(webRoot, root))))).flat();
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
    if (rules.length > 0) {
      const where = (rule) => {
        if (rule !== 'R6') return path;
        const index = source.search(DISABLE_COMMENT);
        return `${path}:${String(source.slice(0, index).split('\n').length)}`;
      };
      result[path] = Object.fromEntries(
        rules.map((rule) => [rule, [`${where(rule)} ${RULES[rule]}. ${cite(rule)}`]]),
      );
    }
  }
  return result;
}

/** Adds the violations of `more` to `found`, both shaped as `scan` returns them. */
export function merge(found, more) {
  for (const [path, rules] of Object.entries(more)) {
    found[path] ??= {};
    for (const [rule, messages] of Object.entries(rules)) {
      found[path][rule] = [...(found[path][rule] ?? []), ...messages];
    }
  }
  return found;
}

/**
 * Compares violations with the exemptions and, when given, the exemptions at the
 * base revision. `found` maps a path to its rules, as a list or as `scan` returns
 * them. An entry gained since the base fails unless its rule is not in
 * `baseRules`, the rules checked at the base revision: the commit that adds a
 * check may seed the list with today's uses, and from then on it only shrinks.
 */
export function compare(found, exemptions, baseExemptions, baseRules = null) {
  const errors = [];
  const rulesOf = (path) => {
    const rules = found[path];
    return Array.isArray(rules) ? rules : Object.keys(rules ?? {});
  };
  for (const [path, rules] of Object.entries(found)) {
    for (const rule of rulesOf(path)) {
      if (exemptions[path]?.includes(rule)) continue;
      const messages = Array.isArray(rules) ? [] : rules[rule];
      errors.push(...(messages.length > 0 ? messages : [`${path} ${RULES[rule]}. ${cite(rule)}`]));
    }
  }
  for (const [path, rules] of Object.entries(exemptions)) {
    for (const rule of rules) {
      if (!rulesOf(path).includes(rule)) {
        errors.push(
          `${path} no longer breaks ${rule}. Fix: remove the entry from ${EXEMPTIONS_PATH}. ` +
            cite('R6'),
        );
      }
    }
  }
  if (baseExemptions) {
    for (const [path, rules] of Object.entries(exemptions)) {
      for (const rule of rules) {
        if (baseExemptions[path]?.includes(rule)) continue;
        if (baseRules && !baseRules.has(rule)) continue;
        errors.push(
          `${EXEMPTIONS_PATH} gained ${rule} for ${path}; the exemptions may only shrink. ` +
            `Fix: remove the entry and meet ${rule} in that file. ${cite('R6')}`,
        );
      }
    }
  }
  return errors;
}

/** The rule numbers a design-checks.json text lists as checked. */
export function checkedRules(checksText) {
  return new Set(
    JSON.parse(checksText)
      .filter((entry) => entry.status === 'checked')
      .map((entry) => entry.rule),
  );
}

/**
 * The rules checked at the base revision: from its design-checks.json, or, before
 * that file existed, from the keys of its design-rules.mjs RULES map.
 */
export function readBaseRules(webRoot) {
  const checks = readBaseFile(webRoot, CHECKS_PATH);
  if (checks !== null) return checkedRules(checks);
  const rules = readBaseFile(webRoot, 'scripts/design-rules.mjs');
  if (rules === null) return new Set();
  const map = /export const RULES = \{([\s\S]*?)\n\};/.exec(rules)?.[1] ?? '';
  return new Set([...map.matchAll(/^\s+(R\d+):/gm)].map((match) => match[1]));
}

/** The exemptions at the base revision, or null when there is no base to compare with. */
export function readBaseExemptions(webRoot) {
  const text = readBaseFile(webRoot, EXEMPTIONS_PATH);
  try {
    return text === null ? null : JSON.parse(text);
  } catch {
    return null;
  }
}

/** The rulebook exists and AGENTS.md points to it. */
export async function checkRulebook(repoRoot) {
  const errors = [];
  try {
    await readFile(join(repoRoot, RULEBOOK), 'utf8');
  } catch {
    errors.push(`${RULEBOOK} is missing. Fix: restore it. ${cite('R1')}`);
  }
  try {
    const agents = await readFile(join(repoRoot, 'AGENTS.md'), 'utf8');
    if (!agents.includes(RULEBOOK)) {
      errors.push(`AGENTS.md does not link ${RULEBOOK}. Fix: link it. ${cite('R1')}`);
    }
  } catch {
    errors.push(`AGENTS.md is missing. Fix: restore it. ${cite('R1')}`);
  }
  return errors;
}

/** The most lines each always-loaded guidance file may have, so it cannot regrow. */
export const LINE_BUDGETS = { 'AGENTS.md': 90, [RULEBOOK]: 190 };

/** Every always-loaded guidance file is within its line budget. */
export async function checkLineBudgets(repoRoot, budgets = LINE_BUDGETS) {
  const errors = [];
  for (const [path, budget] of Object.entries(budgets)) {
    let text;
    try {
      text = await readFile(join(repoRoot, path), 'utf8');
    } catch {
      continue; // checkRulebook reports a missing file.
    }
    const lines = text.replace(/\n$/, '').split('\n').length;
    if (lines > budget) {
      errors.push(
        `${path} has ${String(lines)} lines, over its budget of ${String(budget)}. Fix: cut ` +
          'or merge rules; move a checked rule into a check and retire it. ' +
          cite('R5'),
      );
    }
  }
  return errors;
}

/** The icon component draws the same three sizes this guard knows. */
export function checkIconSizes(source) {
  const declared = /\bICON_SIZES\s*=\s*(\{[^}]*\})/.exec(source)?.[1] ?? '';
  const sizes = Object.fromEntries(
    [...declared.matchAll(/(\w+)\s*:\s*(\d+)/g)].map(([, role, pixels]) => [role, Number(pixels)]),
  );
  if (JSON.stringify(sizes) === JSON.stringify(ICON_SIZES)) return [];
  return [
    `${ICON_COMPONENT} declares other icon sizes than the guard. Fix: declare ICON_SIZES as ` +
      `${JSON.stringify(ICON_SIZES)} in both, or change the rule first. ${cite('R35')}`,
  ];
}

/**
 * Every rule a check cites is listed in design-checks.json. A rule listed as
 * `checked` is also a bold "**Rn.**" in the rulebook, because judgment is needed
 * beyond what its check sees. An `enforced` rule lives only in its check and on
 * the checks page, so it must not reappear in the rulebook. A `retired` rule is
 * covered by another rule or a primitive, and no check may cite it.
 */
export function checkCitations(rulebook, checks, citedByCode) {
  const errors = [];
  const listed = new Map(checks.map((entry) => [entry.rule, entry.status]));
  const inRulebook = new Set([...rulebook.matchAll(/\*\*(R\d+)\.(?:\*\*| )/g)].map((m) => m[1]));
  for (const rule of [...new Set(citedByCode)].sort()) {
    if (!listed.has(rule)) {
      errors.push(
        `A check cites ${rule}, which ${CHECKS_PATH} does not list. Fix: add ${rule} with ` +
          `what it says and which check enforces it. ${cite('R6')}`,
      );
    } else if (listed.get(rule) === 'retired') {
      errors.push(
        `A check cites ${rule}, which ${CHECKS_PATH} lists as retired. Fix: cite the rule ` +
          `that covers it now. ${cite('R6')}`,
      );
    }
  }
  for (const { rule, status } of checks) {
    if (status === 'checked' && !inRulebook.has(rule)) {
      errors.push(
        `${CHECKS_PATH} checks ${rule}, but ${RULEBOOK} has no "**${rule}.**". Fix: restore ` +
          `the rule, or list it as enforced (the check is its only home) or retired. ${cite('R5')}`,
      );
    }
    if ((status === 'enforced' || status === 'retired') && inRulebook.has(rule)) {
      errors.push(
        `${CHECKS_PATH} lists ${rule} as ${status}, but ${RULEBOOK} still has "**${rule}.**". ` +
          `Fix: remove it from the rulebook, or list it as checked. ${cite('R5')}`,
      );
    }
    if (!['checked', 'enforced', 'retired'].includes(status)) {
      errors.push(
        `${CHECKS_PATH} gives ${rule} the status "${String(status)}". Fix: use ` +
          `"checked", "enforced" or "retired". ${cite('R6')}`,
      );
    }
  }
  return errors;
}

export async function readExemptions(webRoot) {
  return JSON.parse(await readFile(join(webRoot, EXEMPTIONS_PATH), 'utf8'));
}
