/**
 * Versions that stored analyses and validations are stamped with.
 *
 * Bump `ANALYZER_VERSION` whenever tokenization, reading conversion, or
 * part-of-speech mapping can produce different output — including a tokenizer
 * asset upgrade. Stored analyses whose version is no longer supported are
 * invalid for new classification and are recomputed from the immutable source
 * text; they are never silently reinterpreted.
 */
export const ANALYZER_VERSION = 'analyzer/3';

/** Bump when classification precedence or normalization rules change. */
export const VALIDATOR_VERSION = 'validator/1';

/**
 * Bump when expression extraction, canonical expression or reading
 * normalization changes. Version 2 reads ruby, bracket readings and cloze
 * markup as the expression they annotate.
 */
export const NORMALIZATION_VERSION = 'normalization/2';

/**
 * Bump when sentence segmentation rules change. Version 2 ends a sentence at
 * every line break, even inside a bracket that is never closed.
 */
export const SEGMENTATION_RULES_VERSION = 'segmentation/2';

/** Analyzer versions whose stored output the current code can still interpret. */
export const SUPPORTED_ANALYZER_VERSIONS: readonly string[] = [ANALYZER_VERSION];

export function isSupportedAnalyzerVersion(version: string): boolean {
  return SUPPORTED_ANALYZER_VERSIONS.includes(version);
}
