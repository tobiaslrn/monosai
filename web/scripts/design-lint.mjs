// Runs eslint.design.config.js, the design rules that need a template or
// TypeScript syntax tree, and groups what it finds by file and rule so the
// shared exemption list (design-rules-exemptions.json) applies to it.

import { access } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { ESLint } from 'eslint';
import { ruleOf } from './design-lint-rules.mjs';

export const CONFIG = 'eslint.design.config.js';
const ROOTS = ['src/app/features', 'src/app/core'];

/** Whether the design lint reads a web-relative path. */
export function isLinted(path) {
  return /^src\/app\/(features|core)\/.+\.(ts|html)$/.test(path) && !/\.spec\.ts$/.test(path);
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Lints features and core, or only `paths` (web-relative). Returns violations
 * shaped as design-rules.mjs `scan` returns them, and `errors` for files that
 * could not be parsed, which no exemption covers.
 */
export async function lintDesign(webRoot, paths = null) {
  let targets = ROOTS;
  if (paths) {
    targets = [];
    for (const path of paths.filter(isLinted)) {
      if (await exists(join(webRoot, path))) targets.push(path);
    }
    if (targets.length === 0) return { found: {}, errors: [] };
  }
  const eslint = new ESLint({
    cwd: webRoot,
    overrideConfigFile: join(webRoot, CONFIG),
    errorOnUnmatchedPattern: false,
    warnIgnored: false,
  });
  const found = {};
  const errors = [];
  for (const result of await eslint.lintFiles(targets)) {
    const path = relative(webRoot, result.filePath).replaceAll('\\', '/');
    for (const message of result.messages) {
      const where = `${path}:${String(message.line)}:${String(message.column)}`;
      if (message.fatal) {
        errors.push(`${where} cannot be parsed for the design checks: ${message.message}`);
        continue;
      }
      if (message.severity !== 2 || message.ruleId !== 'no-restricted-syntax') continue;
      const rule = ruleOf(message.message);
      if (!rule) {
        errors.push(`${where} ${message.message}`);
        continue;
      }
      found[path] ??= {};
      (found[path][rule] ??= []).push(`${where} ${message.message}`);
    }
  }
  return { found, errors };
}
