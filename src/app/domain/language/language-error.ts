import type { DomainErrorBase } from '../shared/errors';

/**
 * Every failure the language pipeline can report. Asset problems, worker
 * transport problems, and analysis problems stay distinguishable so the UI can
 * offer the right recovery instead of a generic "something went wrong".
 */
export type LanguageErrorCode =
  | 'assets-unavailable'
  | 'asset-manifest-invalid'
  | 'asset-integrity-mismatch'
  | 'asset-schema-invalid'
  | 'tokenizer-initialization-failed'
  | 'dictionary-initialization-failed'
  | 'not-initialized'
  | 'protocol-version-mismatch'
  | 'worker-unavailable'
  | 'worker-terminated'
  | 'invalid-request'
  | 'invalid-response'
  | 'analysis-failed'
  | 'snapshot-not-compiled'
  | 'cancelled'
  | 'unknown';

export type LanguageError = DomainErrorBase<'language', LanguageErrorCode>;

export function languageError(
  code: LanguageErrorCode,
  message: string,
  cause?: string,
): LanguageError {
  return { domain: 'language', code, message, ...(cause === undefined ? {} : { cause }) };
}

/**
 * Codes that a fresh download and re-initialization can plausibly fix. An
 * integrity mismatch belongs here: the cached bytes are wrong, not the source.
 */
const RECOVERABLE_BY_REINITIALIZATION: readonly LanguageErrorCode[] = [
  'assets-unavailable',
  'asset-integrity-mismatch',
  'tokenizer-initialization-failed',
  'dictionary-initialization-failed',
  'not-initialized',
  'worker-terminated',
  'worker-unavailable',
];

export function isRecoverableByReinitialization(error: LanguageError): boolean {
  return RECOVERABLE_BY_REINITIALIZATION.includes(error.code);
}
