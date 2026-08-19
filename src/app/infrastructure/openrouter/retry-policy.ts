/**
 * Bounded automatic retry for transient provider failures.
 *
 * The AI specification allows at most two automatic retries, only for rate
 * limits, provider outages, and network interruption, and only while the
 * request has not been cancelled. Every limit lives here so no call site can
 * quietly multiply them.
 */

export const MAX_AUTOMATIC_RETRIES = 2;

const BASE_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 8_000;

/**
 * Longest the learner is made to wait on a provider's own `Retry-After`.
 *
 * A rate limit measured in minutes is not something to sit through behind a
 * spinner: past this, the attempt stops and the error reports the wait so the
 * UI can offer Retry instead.
 */
export const MAX_HONOURED_RETRY_AFTER_MS = 10_000;

/**
 * Delay before the next attempt, or `null` when there should not be one.
 *
 * `attempt` is zero-based: 0 is the wait before the first retry. Jitter is
 * applied over the full interval so that two tabs retrying together do not stay
 * in lockstep.
 */
export function nextDelayMs(
  attempt: number,
  retryAfterMs: number | undefined,
  random: () => number,
): number | null {
  if (attempt >= MAX_AUTOMATIC_RETRIES) {
    return null;
  }
  if (retryAfterMs !== undefined) {
    return retryAfterMs > MAX_HONOURED_RETRY_AFTER_MS ? null : retryAfterMs;
  }
  const capped = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** attempt);
  return Math.round(capped * (0.5 + 0.5 * random()));
}
