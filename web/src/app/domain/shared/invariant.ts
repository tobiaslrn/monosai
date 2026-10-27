/**
 * Narrows a value the surrounding logic guarantees is present — typically an
 * array element at an index a bounds check or a length invariant already
 * proves, which `noUncheckedIndexedAccess` cannot follow.
 *
 * Reaching the throw means that guarantee was broken: it is a bug, not an
 * expected failure, so callers never catch it to recover. Absent values that
 * can legitimately occur are handled where they occur instead.
 */
export function defined<T>(value: T | undefined, context: string): T {
  if (value === undefined) {
    throw new Error(`Invariant violated in ${context}: expected a value`);
  }
  return value;
}
