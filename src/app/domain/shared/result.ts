/**
 * Explicit success/failure value used across domain, application, and adapter
 * boundaries. Failures are typed domain errors, never thrown `Error` objects.
 */
export type Result<TValue, TError> =
  { readonly ok: true; readonly value: TValue } | { readonly ok: false; readonly error: TError };

export function ok<TValue>(value: TValue): Result<TValue, never> {
  return { ok: true, value };
}

export function err<TError>(error: TError): Result<never, TError> {
  return { ok: false, error };
}

export function isOk<TValue, TError>(
  result: Result<TValue, TError>,
): result is { ok: true; value: TValue } {
  return result.ok;
}

export function isErr<TValue, TError>(
  result: Result<TValue, TError>,
): result is { ok: false; error: TError } {
  return !result.ok;
}

export function mapResult<TValue, TNext, TError>(
  result: Result<TValue, TError>,
  project: (value: TValue) => TNext,
): Result<TNext, TError> {
  return result.ok ? ok(project(result.value)) : result;
}

export function mapError<TValue, TError, TNext>(
  result: Result<TValue, TError>,
  project: (error: TError) => TNext,
): Result<TValue, TNext> {
  return result.ok ? result : err(project(result.error));
}

/** Unwraps a result, throwing only when the caller has already proven success. */
export function unwrap<TValue, TError>(result: Result<TValue, TError>): TValue {
  if (!result.ok) {
    throw new Error('Result.unwrap called on a failed result');
  }
  return result.value;
}
