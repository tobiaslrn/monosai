#!/usr/bin/env node
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { readJson, sha256File, writeArtifact } from './lib/fs-json.mjs';
import { buildDictionary, writeDictionary } from './build-dictionary.mjs';
import { buildGrammarCatalog, writeGrammarCatalog } from './build-grammar-catalog.mjs';
import { buildStructuralBaseline, writeStructuralBaseline } from './build-structural-baseline.mjs';
import { LANGUAGE_BUNDLE_VERSION, assetOutputDir, tokenizerSourcePath } from './lib/layout.mjs';

const CACHE_DIR = '.asset-cache';
const SOURCE_DIR = 'data/language';

/**
 * Regenerates every committed language asset and its manifest.
 *
 * Only this script writes `public/assets/language/<version>/`. Output is
 * deterministic: the same pinned inputs always produce byte-identical files and
 * therefore identical manifest digests.
 */
async function main() {
  const sources = await readJson('scripts/assets/sources.json');
  const attribution = await readJson(join(SOURCE_DIR, 'attribution.json'));
  const outputDir = assetOutputDir();

  const dictionary = await buildDictionary({
    sources,
    cacheDir: CACHE_DIR,
    version: attribution.dictionary.datasetVersion,
  });
  if (dictionary.unmappedCodes.length > 0) {
    throw new Error(
      `Unmapped JMdict part-of-speech codes need review: ${dictionary.unmappedCodes.join(', ')}`,
    );
  }
  const dictionaryFile = await writeDictionary(
    join(outputDir, 'dictionary.json'),
    dictionary.artifact,
  );

  const catalog = await buildGrammarCatalog({
    sourcePath: join(SOURCE_DIR, 'grammar-catalog.source.json'),
  });
  const catalogFile = await writeGrammarCatalog(
    join(outputDir, 'grammar-catalog.json'),
    catalog.artifact,
  );

  const baseline = await buildStructuralBaseline({
    sourcePath: join(SOURCE_DIR, 'structural-baseline.source.json'),
  });
  const baselineFile = await writeStructuralBaseline(
    join(outputDir, 'structural-baseline.json'),
    baseline.artifact,
  );

  const tokenizerPath = tokenizerSourcePath(sources);
  const tokenizerFile = {
    bytes: (await stat(tokenizerPath)).size,
    sha256: await sha256File(tokenizerPath),
  };

  const manifest = {
    schemaVersion: 1,
    bundleVersion: LANGUAGE_BUNDLE_VERSION,
    components: {
      tokenizer: {
        version: attribution.tokenizer.datasetVersion,
        engine: `${sources.tokenizer.package}@${sources.tokenizer.version}`,
        files: [
          {
            path: `tokenizer/${sources.tokenizer.file}`,
            bytes: tokenizerFile.bytes,
            sha256: tokenizerFile.sha256,
          },
        ],
        attribution: attribution.tokenizer.attribution,
      },
      dictionary: {
        version: dictionary.artifact.version,
        entryCount: dictionary.artifact.entryCount,
        files: [
          { path: 'dictionary.json', bytes: dictionaryFile.bytes, sha256: dictionaryFile.sha256 },
        ],
        attribution: attribution.dictionary.attribution,
      },
      grammarCatalog: {
        version: catalog.artifact.version,
        ruleCount: catalog.artifact.ruleCount,
        countsByLevel: catalog.artifact.countsByLevel,
        files: [
          { path: 'grammar-catalog.json', bytes: catalogFile.bytes, sha256: catalogFile.sha256 },
        ],
        attribution: attribution.grammarCatalog.attribution,
      },
      structuralBaseline: {
        version: baseline.artifact.version,
        entryCount: baseline.artifact.entryCount,
        files: [
          {
            path: 'structural-baseline.json',
            bytes: baselineFile.bytes,
            sha256: baselineFile.sha256,
          },
        ],
        attribution: attribution.structuralBaseline.attribution,
      },
    },
  };

  const manifestFile = await writeArtifact(
    join(outputDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
  );

  process.stdout.write(
    [
      `language bundle ${LANGUAGE_BUNDLE_VERSION} written to ${outputDir}`,
      `  dictionary          ${dictionary.artifact.entryCount} entries, ${dictionaryFile.bytes} bytes`,
      `  grammar catalog     ${catalog.artifact.ruleCount} rules, ${catalogFile.bytes} bytes`,
      `  structural baseline ${baseline.artifact.entryCount} entries, ${baselineFile.bytes} bytes`,
      `  tokenizer           ${tokenizerFile.bytes} bytes (served from the locked package)`,
      `  manifest            ${manifestFile.bytes} bytes`,
      '',
    ].join('\n'),
  );
}

await main();
