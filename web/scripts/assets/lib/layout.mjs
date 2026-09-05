import { join } from 'node:path';

/**
 * Immutable language-bundle version. Bumping it creates a new asset directory;
 * previously cached bundles stay valid for stored analyses until a cleanup
 * migration removes them.
 */
export const LANGUAGE_BUNDLE_VERSION = '1';

export function assetOutputDir() {
  return join('public', 'assets', 'language', LANGUAGE_BUNDLE_VERSION);
}

/**
 * The tokenizer runtime ships from the locked npm package and is copied into the
 * build output by the Angular builder, so it is never committed twice.
 */
export function tokenizerSourcePath(sources) {
  return join('node_modules', sources.tokenizer.package, sources.tokenizer.file);
}
