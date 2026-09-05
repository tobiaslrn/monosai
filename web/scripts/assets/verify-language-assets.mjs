#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readJson, sha256, sha256File } from './lib/fs-json.mjs';
import { LANGUAGE_BUNDLE_VERSION, assetOutputDir, tokenizerSourcePath } from './lib/layout.mjs';
import { buildGrammarPresets } from './build-grammar-presets.mjs';
import { buildStructuralBaseline } from './build-structural-baseline.mjs';

/**
 * Offline CI gate for the shipped language bundle.
 *
 * It re-validates the committed dataset sources, proves that every manifest
 * digest matches the file that will be served, and proves that the committed
 * preset and baseline artifacts are exactly what their sources produce. It
 * needs no network, so it runs in every pull request.
 */
async function main() {
  const failures = [];
  const outputDir = assetOutputDir();
  const manifest = await readJson(join(outputDir, 'manifest.json'));

  if (manifest.bundleVersion !== LANGUAGE_BUNDLE_VERSION) {
    failures.push(
      `manifest bundleVersion ${manifest.bundleVersion} does not match the build layout ${LANGUAGE_BUNDLE_VERSION}`,
    );
  }

  const sources = await readJson('scripts/assets/sources.json');
  for (const [name, component] of Object.entries(manifest.components)) {
    if (component.attribution?.licences?.length === undefined) {
      failures.push(`component ${name} is missing licence attribution`);
    }
    for (const file of component.files) {
      const path = name === 'tokenizer' ? tokenizerSourcePath(sources) : join(outputDir, file.path);
      const bytes = await readFile(path).catch(() => null);
      if (bytes === null) {
        failures.push(`component ${name} file ${file.path} is missing at ${path}`);
        continue;
      }
      if (bytes.length !== file.bytes) {
        failures.push(
          `component ${name} file ${file.path} is ${bytes.length} bytes, manifest says ${file.bytes}`,
        );
      }
      const digest = sha256(bytes);
      if (digest !== file.sha256) {
        failures.push(
          `component ${name} file ${file.path} digest ${digest} does not match manifest ${file.sha256}`,
        );
      }
    }
  }

  const presets = await buildGrammarPresets({
    sourcePath: join('data', 'language', 'grammar-presets.source.json'),
  });
  const baseline = await buildStructuralBaseline({
    sourcePath: join('data', 'language', 'structural-baseline.source.json'),
  });
  const committedPresets = await readJson(join(outputDir, 'grammar-presets.json'));
  const committedBaseline = await readJson(join(outputDir, 'structural-baseline.json'));
  if (JSON.stringify(committedPresets) !== JSON.stringify(presets.artifact)) {
    failures.push(
      'committed grammar-presets.json differs from its source; run npm run assets:build',
    );
  }
  if (JSON.stringify(committedBaseline) !== JSON.stringify(baseline.artifact)) {
    failures.push(
      'committed structural-baseline.json differs from its source; run npm run assets:build',
    );
  }

  const dictionary = await readJson(join(outputDir, 'dictionary.json'));
  if (dictionary.source.sha256 !== sources.jmdict.sha256) {
    failures.push('committed dictionary.json was not built from the pinned JMdict release');
  }
  const tokenizerDigest = await sha256File(tokenizerSourcePath(sources));
  const manifestTokenizerDigest = manifest.components.tokenizer.files[0].sha256;
  if (tokenizerDigest !== manifestTokenizerDigest) {
    failures.push(
      'the locked tokenizer package does not match the manifest digest; run npm run assets:build',
    );
  }

  if (failures.length > 0) {
    process.stderr.write(`language asset verification failed:\n- ${failures.join('\n- ')}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    [
      `language bundle ${manifest.bundleVersion} verified`,
      `  dictionary          ${manifest.components.dictionary.entryCount} entries`,
      `  grammar presets     ${manifest.components.grammarPresets.presetCount} presets`,
      `  structural baseline ${manifest.components.structuralBaseline.entryCount} entries`,
      '',
    ].join('\n'),
  );
}

await main();
