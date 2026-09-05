#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST_DIR = 'dist/monosai/browser';
const STATS_PATH = 'dist/monosai/stats.json';
const BUDGETS_PATH = 'bundle-budgets.json';
const CHECK = process.argv.includes('--check');

/**
 * The set of output files loaded eagerly: everything `index.html` references
 * directly (the main script, its `modulepreload` hints, and the stylesheet),
 * plus everything reachable from those by following only static
 * `import-statement` edges. Everything reachable only through a
 * `dynamic-import` edge (route `loadComponent`, workers) is lazy — the same
 * distinction esbuild's own metafile draws, reused here rather than
 * re-implemented against the dist directory, which no longer carries this
 * information once code-split into files.
 */
function initialOutputNames(outputs, indexHtml) {
  const initial = new Set();
  const visit = (name) => {
    if (initial.has(name)) {
      return;
    }
    initial.add(name);
    const meta = outputs[name];
    for (const imp of meta?.imports ?? []) {
      if (imp.kind === 'import-statement') {
        visit(imp.path);
      }
    }
  };

  for (const match of indexHtml.matchAll(/<(?:script|link)[^>]+(?:src|href)="([^"]+)"/g)) {
    const name = match[1].split('/').pop();
    if (name in outputs) {
      visit(name);
    }
  }
  return initial;
}

function formatKb(bytes) {
  return `${(bytes / 1024).toFixed(1)} kB`;
}

function toTable(rows, title) {
  const lines = [`### ${title}`, '', '| File | Raw | Gzip |', '| --- | --- | --- |'];
  for (const row of rows) {
    lines.push(`| ${row.name} | ${formatKb(row.rawBytes)} | ${formatKb(row.gzipBytes)} |`);
  }
  return lines.join('\n');
}

async function main() {
  const statsJson = await readFile(STATS_PATH, 'utf8').catch(() => null);
  if (statsJson === null) {
    process.stderr.write(`${STATS_PATH} not found; run npm run build:pages first\n`);
    process.exitCode = 1;
    return;
  }
  const { outputs } = JSON.parse(statsJson);
  const jsAndCssOutputs = Object.keys(outputs).filter((name) => /\.(js|css)$/.test(name));
  const indexHtml = await readFile(join(DIST_DIR, 'index.html'), 'utf8');
  const initialNames = initialOutputNames(outputs, indexHtml);

  const chunks = [];
  for (const name of jsAndCssOutputs) {
    const bytes = await readFile(join(DIST_DIR, name)).catch(() => null);
    if (bytes === null) {
      // Some metafile entries are intermediate build artifacts (e.g. a
      // component stylesheet later inlined into its chunk) that never reach
      // the final dist directory; only what is actually served is reported.
      continue;
    }
    chunks.push({ name, rawBytes: bytes.length, gzipBytes: gzipSync(bytes).length });
  }

  const initial = chunks
    .filter((chunk) => initialNames.has(chunk.name))
    .sort((a, b) => b.gzipBytes - a.gzipBytes);
  const lazy = chunks
    .filter((chunk) => !initialNames.has(chunk.name))
    .sort((a, b) => b.gzipBytes - a.gzipBytes);

  const initialGzipBytes = initial.reduce((sum, chunk) => sum + chunk.gzipBytes, 0);
  const largestLazyGzipBytes = lazy[0]?.gzipBytes ?? 0;

  const report = [
    toTable(initial, 'Initial chunks'),
    '',
    `**Initial total (gzip): ${formatKb(initialGzipBytes)}**`,
    '',
    toTable(lazy, 'Lazy chunks'),
    '',
    `**Largest lazy chunk (gzip): ${formatKb(largestLazyGzipBytes)}**`,
    '',
  ].join('\n');

  process.stdout.write(`${report}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFile } = await import('node:fs/promises');
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
  }

  if (!CHECK) {
    return;
  }

  const budgets = JSON.parse(await readFile(BUDGETS_PATH, 'utf8'));
  const failures = [];
  if (initialGzipBytes > budgets.initial.maxGzipBytes) {
    failures.push(
      `initial gzip ${String(initialGzipBytes)}B exceeds budget ${String(budgets.initial.maxGzipBytes)}B`,
    );
  }
  if (largestLazyGzipBytes > budgets.largestLazyChunk.maxGzipBytes) {
    failures.push(
      `largest lazy chunk gzip ${String(largestLazyGzipBytes)}B exceeds budget ${String(budgets.largestLazyChunk.maxGzipBytes)}B`,
    );
  }
  if (failures.length > 0) {
    process.stderr.write(`bundle budget exceeded:\n- ${failures.join('\n- ')}\n`);
    process.exitCode = 1;
  }
}

await main();
