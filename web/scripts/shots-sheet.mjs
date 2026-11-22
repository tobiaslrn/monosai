#!/usr/bin/env node
import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Lays the captures of `npm run shots` out on one page: a row per scenario, a
 * column per project (desktop and Android, light and dark). With
 * a capture set taken before the change, each capture sits beside its before,
 * so a difference shows at the same scale. The before set is
 * `test-results/shots-before` when it exists (capture it on the base revision
 * with `MONOSAI_SHOTS_DIR=test-results/shots-before npm run shots`), or the
 * folder `--before` names.
 *
 *   npm run shots:sheet -- [--dir test-results/shots] [--before <dir>]
 *
 * Writes `index.html` into the captures folder and prints its path.
 */
export function buildSheet(afterDir, beforeDir) {
  const scenarios = listDirectories(afterDir);
  const sections = scenarios.map((scenario) => {
    const shots = listPngs(join(afterDir, scenario));
    const figures = shots.map((file) => {
      const after = `${scenario}/${file}`;
      const before = beforeDir === null ? null : join(beforeDir, scenario, file);
      const beforeImage =
        before === null
          ? ''
          : existsSync(before)
            ? image(relative(afterDir, before), 'Before')
            : '<p class="missing">No before</p>';
      return `<figure><figcaption>${escape(file.replace(/\.png$/, ''))}</figcaption><div class="pair">${beforeImage}${image(after, beforeDir === null ? '' : 'After')}</div></figure>`;
    });
    return `<section><h2>${escape(scenario)}</h2><div class="shots">${figures.join('')}</div></section>`;
  });
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Monosai shots</title>
<style>
  body { margin: 0; padding: 16px; font: 14px system-ui, sans-serif; background: #e8e6e1; color: #1f1f1f; }
  h1 { margin: 0 0 16px; font-size: 20px; }
  h2 { margin: 24px 0 8px; font-size: 16px; }
  .shots { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start; }
  figure { margin: 0; }
  figcaption { margin-bottom: 4px; font-weight: 600; }
  .pair { display: flex; gap: 8px; align-items: flex-start; }
  .pair div { display: flex; flex-direction: column; gap: 2px; }
  img { display: block; max-width: 420px; max-height: 900px; border: 1px solid #b9b5ad; background: #fff; }
  .missing { width: 200px; color: #7a2e2e; }
</style>
</head>
<body>
<h1>Monosai shots${beforeDir === null ? '' : ': before and after'}</h1>
${sections.length === 0 ? '<p>No captures yet. Run <code>npm run shots</code>.</p>' : sections.join('\n')}
</body>
</html>
`;
}

const DEFAULT_BEFORE = 'test-results/shots-before';

function image(src, label) {
  const caption = label === '' ? '' : `<span>${label}</span>`;
  return `<div>${caption}<a href="${escape(src)}"><img src="${escape(src)}" alt="${escape(src)}" loading="lazy"></a></div>`;
}

function listDirectories(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((name) => statSync(join(directory, name)).isDirectory())
    .filter((name) => listPngs(join(directory, name)).length > 0)
    .sort();
}

function listPngs(directory) {
  return readdirSync(directory)
    .filter((name) => name.endsWith('.png'))
    .sort();
}

function escape(text) {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
}

function option(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? null : (args[index + 1] ?? null);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const afterDir = resolve(
    option(args, '--dir') ?? process.env.MONOSAI_SHOTS_DIR ?? 'test-results/shots',
  );
  const before = option(args, '--before') ?? DEFAULT_BEFORE;
  const beforeDir =
    before === DEFAULT_BEFORE && !existsSync(resolve(before)) ? null : resolve(before);
  if (beforeDir !== null && !existsSync(beforeDir)) {
    process.stderr.write(`shots-sheet: ${beforeDir} does not exist\n`);
    process.exitCode = 1;
  } else {
    const output = join(afterDir, 'index.html');
    writeFileSync(output, buildSheet(afterDir, beforeDir));
    process.stdout.write(`${output}\n`);
  }
}
