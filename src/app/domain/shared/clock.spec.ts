import { describe, expect, it } from 'vitest';
import { fixedClock, systemClock } from './clock';

describe('clock', () => {
  it('system clock returns epoch milliseconds', () => {
    expect(systemClock.now()).toBeGreaterThan(1_600_000_000_000);
  });

  it('fixed clock is deterministic and can advance', () => {
    const clock = fixedClock(1000);
    expect(clock.now()).toBe(1000);
    expect(clock.now()).toBe(1000);

    const stepping = fixedClock(1000, 5);
    expect(stepping.now()).toBe(1000);
    expect(stepping.now()).toBe(1005);
  });
});
