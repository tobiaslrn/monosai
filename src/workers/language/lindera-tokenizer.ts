import { initSync, TokenizerBuilder } from 'lindera-wasm-web-ipadic/lindera_wasm.js';
import type { RawToken, TokenizerRuntime } from './tokenizer-runtime';

/** IPADIC writes an absent feature as an asterisk. */
const ABSENT = '*';

interface LinderaToken {
  readonly surface?: unknown;
  readonly byteStart?: unknown;
  readonly byteEnd?: unknown;
  readonly partOfSpeech?: unknown;
  readonly partOfSpeechSubcategory1?: unknown;
  readonly partOfSpeechSubcategory2?: unknown;
  readonly partOfSpeechSubcategory3?: unknown;
  readonly baseForm?: unknown;
  readonly reading?: unknown;
  readonly conjugationType?: unknown;
}

function text(value: unknown): string {
  return typeof value === 'string' && value !== ABSENT ? value : '';
}

function offset(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : -1;
}

function toRawToken(token: LinderaToken): RawToken | null {
  const surface = typeof token.surface === 'string' ? token.surface : '';
  const byteStart = offset(token.byteStart);
  const byteEnd = offset(token.byteEnd);
  if (surface.length === 0 || byteStart < 0 || byteEnd <= byteStart) {
    return null;
  }
  return {
    surface,
    byteStart,
    byteEnd,
    partOfSpeech: text(token.partOfSpeech),
    subcategory1: text(token.partOfSpeechSubcategory1),
    subcategory2: text(token.partOfSpeechSubcategory2),
    subcategory3: text(token.partOfSpeechSubcategory3),
    baseForm: text(token.baseForm),
    reading: text(token.reading),
    conjugationType: text(token.conjugationType),
  };
}

/**
 * Wraps the Lindera WebAssembly tokenizer.
 *
 * This is the only file that imports the tokenizer library. It receives already
 * verified asset bytes, instantiates the module synchronously from them, and
 * converts library output into `RawToken`, so swapping the tokenizer later means
 * replacing this file alone.
 */
export function createLinderaRuntime(bytes: Uint8Array): Promise<TokenizerRuntime> {
  const module = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(module).set(bytes);
  initSync({ module });

  const builder = new TokenizerBuilder();
  builder.setDictionary('embedded://ipadic');
  builder.setMode('normal');
  // Whitespace is part of the source text and must reach the reader untouched.
  builder.setKeepWhitespace(true);
  const tokenizer = builder.build();

  return Promise.resolve({
    engine: 'lindera-ipadic',
    tokenize(input: string): readonly RawToken[] {
      const produced: unknown = tokenizer.tokenize(input);
      if (!Array.isArray(produced)) {
        return [];
      }
      const tokens: RawToken[] = [];
      for (const candidate of produced) {
        const raw = toRawToken(candidate as LinderaToken);
        if (raw !== null) {
          tokens.push(raw);
        }
      }
      return tokens;
    },
  });
}
