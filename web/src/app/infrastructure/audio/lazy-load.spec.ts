import { describe, expect, it } from 'vitest';
import { retryOnRejection, untilAborted } from './lazy-load';

describe('retryOnRejection', () => {
  it('shares one load while it is under way and after it succeeded', async () => {
    let loads = 0;
    const load = retryOnRejection(() => {
      loads += 1;
      return Promise.resolve('loaded');
    });

    expect(await Promise.all([load(), load()])).toEqual(['loaded', 'loaded']);
    expect(await load()).toBe('loaded');
    expect(loads).toBe(1);
  });

  it('asks again after a failure instead of replaying it', async () => {
    let online = false;
    const load = retryOnRejection(() =>
      online ? Promise.resolve('loaded') : Promise.reject(new TypeError('fetch')),
    );

    await expect(load()).rejects.toThrow('fetch');
    online = true;
    await expect(load()).resolves.toBe('loaded');
  });
});

describe('untilAborted', () => {
  it('rejects at once when aborted, while the work is still stalled', async () => {
    const controller = new AbortController();
    const waiting = untilAborted(new Promise(() => undefined), controller.signal);

    controller.abort();

    await expect(waiting).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('passes the outcome through otherwise', async () => {
    const signal = new AbortController().signal;

    await expect(untilAborted(Promise.resolve(1), signal)).resolves.toBe(1);
    await expect(untilAborted(Promise.reject(new Error('no')), signal)).rejects.toThrow('no');
    await expect(untilAborted(Promise.resolve(2), undefined)).resolves.toBe(2);
  });
});
