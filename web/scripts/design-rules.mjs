#!/usr/bin/env node
// The design rulebook, `docs/design/rules.md`, is binding. This scan holds the
// rules that can be checked cheaply and reliably, and fails citing the rule's
// number. Call sites that later work will replace are on an exemption list that
// may only shrink: a new use fails, an exemption whose use is gone fails until it
// is removed, and an entry added since the base revision fails.

import { readFile, readdir } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readBaseAllowlist, templatesOf } from './composition-freeze.mjs';

export const EXEMPTIONS_PATH = 'scripts/design-rules-exemptions.json';
export const RULEBOOK = 'docs/design/rules.md';

/** The three icon-size roles (inline, control, feature), in pixels. */
export const ICON_SIZES = [16, 20, 24];

/** What each guard enforces; the key is the rule number in the rulebook. */
export const RULES = {
  R20: 'uses a native <select>; every choice from a list is mn-select or mn-model-picker',
  R35: `sets an mn-icon size outside the three icon-size roles (${ICON_SIZES.join(', ')})`,
  R15: 'puts a button inside an <mn-settings-row>; a row never holds a button, field or pill',
  R39: 'writes a colour literal outside _tokens.scss; use a colour token',
  R40: 'scales on press; a press is a colour change and nothing moves',
  R44: 'writes `transition: all`; motion lives in _motion.scss and names its properties',
};

const SOURCE = /\.(ts|html|scss)$/;
const COLOUR_LITERAL = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/i;

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
  }
  return found;
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

  for (const css of stylesOf(path, source)) {
    for (const rule of styleViolations(css)) found.add(rule);
    if (!isTokens && hasColourLiteral(css)) found.add('R39');
  }

  if (inApp && extname(path) !== '.scss') {
    for (const template of templatesOf(path, source)) {
      if (/<select[\s>]/i.test(template)) found.add('R20');
      for (const tag of template.matchAll(/<mn-icon\b[^>]*>/g)) {
        for (const size of tag[0].matchAll(/(?:\[size\]|\bsize)\s*=\s*"(\d+)"/g)) {
          if (!ICON_SIZES.includes(Number(size[1]))) found.add('R35');
        }
      }
      for (const row of template.matchAll(/<mn-settings-row\b[\s\S]*?<\/mn-settings-row>/g)) {
        if (/\bmnButton\b|<mn-button\b/.test(row[0])) found.add('R15');
      }
      for (const style of template.matchAll(/\sstyle\s*=\s*"([^"]*)"/g)) {
        if (COLOUR_LITERAL.test(style[1])) found.add('R39');
      }
    }
  }

  return [...found].sort();
}

/** Every violation under src/app and src/styles, keyed by web-relative path. */
export async function scan(webRoot) {
  const result = {};
  for (const root of ['src/app', 'src/styles']) {
    for (const file of await collect(join(webRoot, root))) {
      const path = relative(webRoot, file).replaceAll('\\', '/');
      const rules = violationsOf(path, await readFile(file, 'utf8'));
      if (rules.length > 0) result[path] = rules;
    }
  }
  return result;
}

/** Compares a scan with the exemptions and, when given, the exemptions at the base revision. */
export function compare(found, exemptions, baseExemptions) {
  const errors = [];
  for (const [path, rules] of Object.entries(found)) {
    for (const rule of rules) {
      if (!exemptions[path]?.includes(rule)) {
        errors.push(`${path} ${RULES[rule]}. See ${rule} in ${RULEBOOK}.`);
      }
    }
  }
  for (const [path, rules] of Object.entries(exemptions)) {
    for (const rule of rules) {
      if (!found[path]?.includes(rule)) {
        errors.push(`${path} no longer breaks ${rule}: remove it from ${EXEMPTIONS_PATH}.`);
      }
    }
  }
  if (baseExemptions) {
    for (const [path, rules] of Object.entries(exemptions)) {
      for (const rule of rules) {
        if (!baseExemptions[path]?.includes(rule)) {
          errors.push(
            `${EXEMPTIONS_PATH} gained ${rule} for ${path}; the exemptions may only shrink. ` +
              `See R6 in ${RULEBOOK}.`,
          );
        }
      }
    }
  }
  return errors;
}

/** The rulebook exists and AGENTS.md points to it. */
export async function checkRulebook(repoRoot) {
  const errors = [];
  try {
    await readFile(join(repoRoot, RULEBOOK), 'utf8');
  } catch {
    errors.push(`${RULEBOOK} is missing. See R1 in ${RULEBOOK}.`);
  }
  try {
    const agents = await readFile(join(repoRoot, 'AGENTS.md'), 'utf8');
    if (!agents.includes(RULEBOOK)) errors.push(`AGENTS.md must link ${RULEBOOK}.`);
  } catch {
    errors.push('AGENTS.md is missing.');
  }
  return errors;
}

export async function checkDesignRules(webRoot) {
  const exemptions = JSON.parse(await readFile(join(webRoot, EXEMPTIONS_PATH), 'utf8'));
  return [
    ...(await checkRulebook(resolve(webRoot, '..'))),
    ...compare(await scan(webRoot), exemptions, readBaseAllowlist(webRoot, EXEMPTIONS_PATH)),
  ];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const errors = await checkDesignRules(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
  if (errors.length > 0) {
    console.error(`Design rules (${RULEBOOK}):\n${errors.map((error) => `  ${error}`).join('\n')}`);
    process.exit(1);
  }
  console.log('Design rules: ok.');
}
