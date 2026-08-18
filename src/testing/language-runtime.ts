import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LanguageAssetManifest } from '../app/domain/language/language-assets';
import type { Token } from '../app/domain/reading/token';
import { mapRawTokens } from '../workers/language/token-mapping';
import type { TokenizerRuntime } from '../workers/language/tokenizer-runtime';

const BUNDLE_DIR = join(process.cwd(), 'public', 'assets', 'language', '1');
const TOKENIZER_PACKAGE_DIR = join(process.cwd(), 'node_modules', 'lindera-wasm-web-ipadic');

let sharedRuntime: Promise<TokenizerRuntime> | null = null;

export function readBundleFile(path: string): Uint8Array {
  const absolute =
    path === 'tokenizer/lindera_wasm_bg.wasm'
      ? join(TOKENIZER_PACKAGE_DIR, 'lindera_wasm_bg.wasm')
      : join(BUNDLE_DIR, path);
  return new Uint8Array(readFileSync(absolute));
}

export function readBundleManifest(): LanguageAssetManifest {
  return JSON.parse(
    readFileSync(join(BUNDLE_DIR, 'manifest.json'), 'utf8'),
  ) as LanguageAssetManifest;
}

/**
 * The real tokenizer, loaded from the committed bundle.
 *
 * Golden expectations are only meaningful against the tokenizer that actually
 * ships, so tests use it directly rather than a stub. The WebAssembly module can
 * be instantiated once per process, so the runtime is shared between tests.
 */
export function sharedTokenizerRuntime(): Promise<TokenizerRuntime> {
  // The promise is memoized rather than its result: concurrent callers must not
  // each instantiate the WebAssembly module, because a second instantiation
  // replaces the module state the first tokenizer is still using.
  sharedRuntime ??= import('../workers/language/lindera-tokenizer').then((module) =>
    module.createLinderaRuntime(readBundleFile('tokenizer/lindera_wasm_bg.wasm')),
  );
  return sharedRuntime;
}

export async function analyzeSentence(text: string): Promise<readonly Token[]> {
  const runtime = await sharedTokenizerRuntime();
  return mapRawTokens(text, runtime.tokenize(text));
}

export async function surfacesOf(text: string): Promise<readonly string[]> {
  return (await analyzeSentence(text)).map((token) => token.surface);
}
