/** Port supplying UTC epoch milliseconds. Injected so time is testable. */
export interface Clock {
  now(): number;
}

export const systemClock: Clock = {
  now: () => Date.now(),
};

/** Deterministic clock used by tests and reproducible fixtures. */
export function fixedClock(startMs: number, stepMs = 0): Clock {
  let current = startMs;
  return {
    now: () => {
      const value = current;
      current += stepMs;
      return value;
    },
  };
}
