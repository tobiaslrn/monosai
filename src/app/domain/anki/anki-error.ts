import type { DomainErrorBase } from '../shared/errors';

/**
 * Every failure an Anki source can report.
 *
 * The variants are kept distinct on purpose: "Anki is not running" and "Anki
 * refused this origin" need different recovery text, and collapsing them into a
 * generic connection failure would leave the learner guessing. The list is the
 * one named in the Anki specification and the UI must preserve every
 * distinction it makes.
 */
export type AnkiErrorCode =
  | 'not-running'
  | 'bridge-not-running'
  | 'addon-missing-or-unreachable'
  | 'permission-denied'
  | 'origin-not-allowed'
  | 'private-network-blocked'
  | 'timeout'
  | 'unsupported-api'
  | 'unsupported-action'
  | 'malformed-response'
  | 'deck-discovery-failed'
  | 'note-type-discovery-failed'
  | 'field-discovery-failed'
  | 'review-evidence-unsupported'
  | 'query-failed'
  | 'package-unreadable'
  | 'package-schema-unsupported'
  | 'package-review-data-missing'
  | 'package-resource-limit'
  | 'cancelled'
  | 'unknown';

export type AnkiError = DomainErrorBase<'anki', AnkiErrorCode>;

export function ankiError(code: AnkiErrorCode, message: string, cause?: string): AnkiError {
  return { domain: 'anki', code, message, ...(cause === undefined ? {} : { cause }) };
}

/**
 * Codes where the same action, unchanged, can plausibly succeed on a second
 * attempt — typically because the learner starts Anki or the network settles.
 * A rejected origin or an unsupported action is not retryable: something
 * outside Monosai has to change first.
 */
const RECOVERABLE_BY_RETRY: readonly AnkiErrorCode[] = [
  'not-running',
  'bridge-not-running',
  'addon-missing-or-unreachable',
  'timeout',
  'query-failed',
  'unknown',
];

export function isRetryable(error: AnkiError): boolean {
  return RECOVERABLE_BY_RETRY.includes(error.code);
}

/**
 * Codes where the local connection cannot be made to work from a browser at
 * all, so the honest next step is the package provider rather than another
 * attempt. Package failures are excluded: suggesting the package path to
 * someone whose package just failed is not a recovery.
 */
const SUGGESTS_PACKAGE_FALLBACK: readonly AnkiErrorCode[] = [
  'not-running',
  'bridge-not-running',
  'addon-missing-or-unreachable',
  'permission-denied',
  'origin-not-allowed',
  'private-network-blocked',
  'unsupported-api',
  'unsupported-action',
  'review-evidence-unsupported',
];

export function suggestsPackageFallback(error: AnkiError): boolean {
  return SUGGESTS_PACKAGE_FALLBACK.includes(error.code);
}
