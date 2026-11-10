/**
 * How long work the learner asked for stays visibly busy at least. An answer
 * that comes back in a few milliseconds would otherwise flash its busy state
 * for one frame and read as a flicker rather than as a check that happened.
 */
export const MINIMUM_BUSY_MS = 600;

/**
 * Resolves with `work`'s outcome, but not before `minimumMs` has passed. A
 * rejection is passed on at once: a failure is not made to wait.
 */
export async function atLeast<T>(
  work: Promise<T>,
  minimumMs: number = MINIMUM_BUSY_MS,
): Promise<T> {
  const elapsed = new Promise<void>((resolve) => {
    setTimeout(resolve, minimumMs);
  });
  const outcome = await work;
  await elapsed;
  return outcome;
}
