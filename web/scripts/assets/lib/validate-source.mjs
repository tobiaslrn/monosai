/** Characters that would turn dataset prose into markup if ever rendered raw. */
const UNSAFE_MARKUP = /[<>]|&[a-z]+;|&#\d+;/i;

export class SourceDataError extends Error {}

export function assert(condition, message) {
  if (!condition) {
    throw new SourceDataError(message);
  }
}

export function assertPlainText(value, where) {
  assert(typeof value === 'string' && value.trim().length > 0, `${where} must be non-empty text`);
  assert(!UNSAFE_MARKUP.test(value), `${where} must not contain markup or HTML entities`);
  assert(value === value.trim(), `${where} must not have leading or trailing whitespace`);
  assert(!/[\r\n\t]/.test(value), `${where} must be a single line`);
}

export function assertOptionalPlainText(value, where) {
  if (value === undefined) {
    return;
  }
  assertPlainText(value, where);
}

export function assertUnique(values, where) {
  const seen = new Set();
  for (const value of values) {
    assert(!seen.has(value), `${where} contains the duplicate value ${JSON.stringify(value)}`);
    seen.add(value);
  }
}
