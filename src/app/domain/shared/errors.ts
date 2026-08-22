/**
 * Base shape for every typed error crossing a Monosai boundary.
 *
 * `domain` identifies the failing subsystem, `code` the specific variant.
 * `message` is developer-facing and must never contain credentials, full user
 * text, or provider response bodies.
 */
export interface DomainErrorBase<TDomain extends string, TCode extends string> {
  readonly domain: TDomain;
  readonly code: TCode;
  readonly message: string;
  /** Redacted description of an underlying cause, for diagnostics only. */
  readonly cause?: string;
}

/** Stable, copyable code shown on error screens instead of raw exception text. */
export function technicalCode(error: DomainErrorBase<string, string>): string {
  return `${error.domain}/${error.code}`;
}

export type UnexpectedErrorDomain = 'unexpected';

export type UnexpectedError = DomainErrorBase<UnexpectedErrorDomain, 'unexpected'>;

export function unexpectedError(message: string, cause?: string): UnexpectedError {
  return { domain: 'unexpected', code: 'unexpected', message, ...(cause ? { cause } : {}) };
}

/**
 * Describes an unknown thrown value without leaking its payload.
 * Only the constructor name and message of real `Error` instances are kept.
 */
export function describeThrown(thrown: unknown): string {
  if (thrown instanceof Error) {
    return `${thrown.name}: ${thrown.message}`;
  }
  return `non-error thrown value of type ${typeof thrown}`;
}

/** Returns only an exception category; never returns an exception message. */
export function safeErrorTypeOf(error: unknown): string {
  if (error instanceof Error && error.name.length > 0) {
    return error.name;
  }
  return typeof error;
}
