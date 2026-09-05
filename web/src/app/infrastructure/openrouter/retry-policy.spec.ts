import { describe, expect, it } from 'vitest';
import { MAX_AUTOMATIC_RETRIES, MAX_HONOURED_RETRY_AFTER_MS, nextDelayMs } from './retry-policy';

const noJitter = (): number => 1;

describe('nextDelayMs', () => {
  it('stops at the policy limit', () => {
    expect(nextDelayMs(MAX_AUTOMATIC_RETRIES, undefined, noJitter)).toBeNull();
    expect(nextDelayMs(MAX_AUTOMATIC_RETRIES + 5, undefined, noJitter)).toBeNull();
  });

  it('grows the wait between attempts', () => {
    const first = nextDelayMs(0, undefined, noJitter);
    const second = nextDelayMs(1, undefined, noJitter);

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(second ?? 0).toBeGreaterThan(first ?? 0);
  });

  it('applies jitter over the full interval', () => {
    expect(nextDelayMs(0, undefined, () => 0)).toBeLessThan(
      nextDelayMs(0, undefined, () => 1) ?? 0,
    );
  });

  it('honours a short Retry-After exactly', () => {
    expect(nextDelayMs(0, 1_500, noJitter)).toBe(1_500);
  });

  it('refuses to sit through a long Retry-After', () => {
    expect(nextDelayMs(0, MAX_HONOURED_RETRY_AFTER_MS + 1, noJitter)).toBeNull();
  });

  it('allows an immediate retry when the provider asks for no wait', () => {
    expect(nextDelayMs(0, 0, noJitter)).toBe(0);
  });
});
