/**
 * Canonical serialization used for every hash and cache key.
 *
 * Rules (documented once, applied everywhere):
 * - object keys are sorted by UTF-16 code unit order;
 * - `undefined` properties and `undefined` array entries are omitted/nulled;
 * - explicit `null` is preserved;
 * - strings have CRLF/CR normalized to LF;
 * - numbers must be finite; `NaN`/`Infinity` are rejected;
 * - output is UTF-8 encoded by the hashing port.
 */
export type CanonicalValue =
  string | number | boolean | null | readonly CanonicalValue[] | CanonicalRecord;

export interface CanonicalRecord {
  // A recursive index signature is required here; `Record` cannot express it.
  readonly [key: string]: CanonicalValue | undefined;
}

export function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n?/g, '\n');
}

export function canonicalJson(value: CanonicalValue): string {
  return serialize(value);
}

function isCanonicalArray(value: CanonicalValue): value is readonly CanonicalValue[] {
  return Array.isArray(value);
}

function serialize(value: CanonicalValue | undefined): string {
  if (value === undefined || value === null) {
    return 'null';
  }
  switch (typeof value) {
    case 'string':
      return JSON.stringify(normalizeLineEndings(value));
    case 'number':
      if (!Number.isFinite(value)) {
        throw new Error('canonicalJson received a non-finite number');
      }
      return JSON.stringify(value);
    case 'boolean':
      return value ? 'true' : 'false';
    default:
      break;
  }
  if (isCanonicalArray(value)) {
    return `[${value.map((entry) => serialize(entry)).join(',')}]`;
  }
  const record: CanonicalRecord = value;
  const parts: string[] = [];
  for (const key of Object.keys(record).sort()) {
    const entry = record[key];
    if (entry === undefined) {
      continue;
    }
    parts.push(`${JSON.stringify(key)}:${serialize(entry)}`);
  }
  return `{${parts.join(',')}}`;
}
