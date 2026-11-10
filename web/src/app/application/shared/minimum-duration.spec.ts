import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { atLeast } from './minimum-duration';

describe('atLeast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('holds a quick answer until the minimum has passed', async () => {
    const settled = vi.fn();
    void atLeast(Promise.resolve('done'), 500).then(settled);

    await vi.advanceTimersByTimeAsync(499);
    expect(settled).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toHaveBeenCalledWith('done');
  });

  it('does not add to a slow answer', async () => {
    let finish: (value: string) => void = () => undefined;
    const work = new Promise<string>((resolve) => {
      finish = resolve;
    });
    const settled = vi.fn();
    void atLeast(work, 500).then(settled);

    await vi.advanceTimersByTimeAsync(800);
    expect(settled).not.toHaveBeenCalled();

    finish('late');
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toHaveBeenCalledWith('late');
  });

  it('passes a failure on at once', async () => {
    const failure = new Error('nope');
    const outcome = atLeast(Promise.reject(failure), 500).catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(0);
    await expect(outcome).resolves.toBe(failure);
  });
});
