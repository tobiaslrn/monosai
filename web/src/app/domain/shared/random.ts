/**
 * Port for the randomness generation depends on.
 *
 * The suggestion palette has to be genuinely varied between runs, which rules
 * out a deterministic sequence, and it has to be reproducible in tests, which
 * rules out reaching for `crypto` from the domain. One narrow method is all the
 * shuffle needs, so that is all the port exposes.
 */
export interface RandomSource {
  /**
   * A uniformly distributed integer in `[0, exclusiveMax)`.
   *
   * Implementations must reject a non-positive bound rather than returning a
   * value outside the range, because a silent `0` would quietly bias a shuffle.
   */
  nextInt(exclusiveMax: number): number;
}

/**
 * Draws `size` distinct entries with a partial Fisher-Yates shuffle.
 *
 * Only the first `size` positions are resolved, so taking twelve words out of
 * eighteen hundred costs twelve swaps rather than eighteen hundred. The input
 * is never mutated, and every draw comes from the injected source, so a test
 * can pin an exact selection while a real run stays varied.
 */
export function sampleWithoutReplacement<T>(
  items: readonly T[],
  size: number,
  random: RandomSource,
): readonly T[] {
  const wanted = Math.max(0, Math.min(Math.trunc(size), items.length));
  if (wanted === 0) {
    return [];
  }

  const pool = [...items];
  for (let index = 0; index < wanted; index += 1) {
    const pick = index + random.nextInt(pool.length - index);
    const swapped = pool[pick];
    pool[pick] = pool[index];
    pool[index] = swapped;
  }
  return pool.slice(0, wanted);
}
