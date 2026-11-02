/**
 * Library-neutral shape of one morphological analysis result.
 *
 * Only `lindera-tokenizer.ts` knows which library produced these fields; every
 * other file, including the rest of the worker, works with this type.
 */
export interface RawToken {
  readonly surface: string;
  readonly byteStart: number;
  readonly byteEnd: number;
  readonly partOfSpeech: string;
  readonly subcategory1: string;
  readonly subcategory2: string;
  readonly subcategory3: string;
  readonly baseForm: string;
  readonly reading: string;
  /** 活用形: which inflected shape this token is in — 未然形, 連用タ接続, 基本形. */
  readonly inflectionForm: string;
  /** 活用型: which paradigm it inflects by — 五段・ラ行, 一段, 特殊・ナイ. */
  readonly conjugationClass: string;
}

export interface TokenizerRuntime {
  readonly engine: string;
  tokenize(text: string): readonly RawToken[];
}

/** Builds a runtime from verified tokenizer asset bytes. */
export type TokenizerRuntimeFactory = (bytes: Uint8Array) => Promise<TokenizerRuntime>;
