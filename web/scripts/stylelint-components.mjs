import { readFile, readdir } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import stylelint from 'stylelint';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(scriptDirectory, '..');
const appRoot = join(webRoot, 'src', 'app');
const configFile = join(webRoot, 'stylelint.config.mjs');
const sourceExtensions = new Set(['.scss', '.ts', '.html']);

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(entryPath)));
    } else if (sourceExtensions.has(extname(entry.name))) {
      files.push(entryPath);
    }
  }

  return files;
}

function lineNumberAt(source, index) {
  return source.slice(0, index).split('\n').length;
}

function extractInlineStyles(filePath, source) {
  const styles = [];
  const pattern = /styles\s*:\s*(?:\[\s*)?`([\s\S]*?)`/g;

  for (const match of source.matchAll(pattern)) {
    const content = match[1];
    const contentOffset = match.index + match[0].indexOf(content);
    const contentLine = lineNumberAt(source, contentOffset);
    styles.push({
      code: `${'\n'.repeat(contentLine - 1)}${content}`,
      filePath,
    });
  }

  return styles;
}

function formatWarning(warning, fallbackPath) {
  const source = warning.source ?? fallbackPath;
  const path = relative(webRoot, source).replaceAll('\\', '/');
  return `${path}:${warning.line}:${warning.column} ${warning.text}`;
}

async function lintCode(code, filePath) {
  const result = await stylelint.lint({
    code,
    codeFilename: filePath,
    configFile,
    customSyntax: 'postcss-scss',
    formatter: 'json',
  });
  const warnings = result.results.flatMap((entry) => entry.warnings);
  return warnings.map((warning) => formatWarning(warning, filePath));
}

function findForbiddenColors(filePath, source) {
  const warnings = [];
  const pattern = /#[0-9a-f]{3,8}\b|\b(?:rgb|rgba)\s*\(/gi;

  for (const match of source.matchAll(pattern)) {
    const line = lineNumberAt(source, match.index);
    const lineStart = source.lastIndexOf('\n', match.index) + 1;
    const column = match.index - lineStart + 1;
    const value = match[0];
    warnings.push(
      `${relative(webRoot, filePath).replaceAll('\\', '/')}:${line}:${column} ` +
        `Raw color ${value} is not allowed outside src/styles.`,
    );
  }

  return warnings;
}

const files = (await collectFiles(appRoot)).sort();
const warnings = [];

for (const filePath of files) {
  const source = await readFile(filePath, 'utf8');
  warnings.push(...findForbiddenColors(filePath, source));

  if (extname(filePath) === '.scss') {
    warnings.push(...(await lintCode(source, filePath)));
  } else if (extname(filePath) === '.ts') {
    for (const inlineStyle of extractInlineStyles(filePath, source)) {
      warnings.push(...(await lintCode(inlineStyle.code, inlineStyle.filePath)));
    }
  }
}

if (warnings.length > 0) {
  console.error(warnings.join('\n'));
  process.exitCode = 1;
}
