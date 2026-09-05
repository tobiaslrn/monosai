import { canonicalJson, type CanonicalValue } from './canonical-json';

/**
 * Port for the single documented hash algorithm used by cache keys,
 * fingerprints, and content hashes. Implementations must be synchronous and
 * usable on the main thread and inside workers.
 */
export interface Hasher {
  readonly algorithm: string;
  hashText(text: string): string;
}

/** Hashes a canonically serialized value with a task-specific domain prefix. */
export function hashCanonical(hasher: Hasher, domainPrefix: string, value: CanonicalValue): string {
  return hasher.hashText(`${domainPrefix}:${canonicalJson(value)}`);
}
