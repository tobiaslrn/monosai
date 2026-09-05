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
