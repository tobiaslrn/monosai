import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PreparationLayer } from '../../domain/enrichment/preparation';
import { PREPARATION_CONCURRENCY, PreparationPacer, type RequestPermit } from './preparation-pacer';

/** Lets every already-resolved promise run before the assertion. */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 5; turn += 1) {
    await Promise.resolve();
  }
}

describe('PreparationPacer', () => {
  let pacer: PreparationPacer;

  beforeEach(() => {
    pacer = new PreparationPacer();
  });

  it('never has more than the shared cap in flight', async () => {
    const permits: RequestPermit[] = [];
    for (let index = 0; index < PREPARATION_CONCURRENCY + 5; index += 1) {
      void pacer.acquire(index, 'english').then((permit) => permits.push(permit));
    }

    await settle();

    expect(pacer.active).toBe(PREPARATION_CONCURRENCY);
    expect(pacer.queued).toBe(5);
  });

  it('grants by sentence position and layer, whatever order callers arrive in', async () => {
    // Fill the pool, so everything below has to queue.
    const blockers: RequestPermit[] = [];
    for (let index = 0; index < PREPARATION_CONCURRENCY; index += 1) {
      blockers.push(await pacer.acquire(-1, 'english'));
    }

    const granted: string[] = [];
    const want = (position: number, layer: PreparationLayer): void => {
      void pacer.acquire(position, layer).then((permit) => {
        granted.push(`${layer}:${String(position)}`);
        permit.release();
      });
    };
    want(40, 'english');
    want(1, 'audio');
    want(1, 'english');
    want(2, 'english');
    want(1, 'grammar');

    await settle();
    expect(granted).toEqual([]);

    for (const blocker of blockers) {
      blocker.release();
    }
    await settle();

    expect(granted).toEqual(['english:1', 'grammar:1', 'audio:1', 'english:2', 'english:40']);
  });

  /**
   * The regression test for the whole feature: a reading fills front to back
   * across all three layers, so sentence 1 has its English, its grammar and its
   * clip long before sentence 60 has anything.
   */
  it('fills a long reading front to back with all three layers interleaved', async () => {
    const sentences = 60;
    const granted: { position: number; layer: PreparationLayer }[] = [];
    const done: Promise<void>[] = [];
    // The pool is busy when the layers declare their work, which is the only
    // interesting case: what is already in flight is never taken back.
    const blockers: RequestPermit[] = [];
    for (let index = 0; index < PREPARATION_CONCURRENCY; index += 1) {
      blockers.push(await pacer.acquire(-1, 'english'));
    }

    const ask = (position: number, layer: PreparationLayer): void => {
      done.push(
        pacer.acquire(position, layer).then(async (permit) => {
          granted.push({ position, layer });
          await Promise.resolve();
          permit.release();
        }),
      );
    };
    // Every layer declares its whole reading at once, and audio — the layer
    // that used to wait for both text layers to finish — arrives first.
    for (let position = sentences - 1; position >= 0; position -= 1) {
      ask(position, 'audio');
    }
    for (let position = 0; position < sentences; position += 1) {
      ask(position, 'english');
      ask(position, 'grammar');
    }

    blockers.forEach((blocker) => {
      blocker.release();
    });
    await Promise.all(done);

    expect(granted).toHaveLength(sentences * 3);
    for (let index = 1; index < granted.length; index += 1) {
      expect(granted[index].position).toBeGreaterThanOrEqual(granted[index - 1].position);
    }
    // The first sentence is finished by all three layers before the last one is
    // touched by any.
    const firstSentence = granted.slice(0, 3).map((entry) => entry.layer);
    expect([...firstSentence].sort()).toEqual(['audio', 'english', 'grammar']);
    expect(granted.slice(0, 3).every((entry) => entry.position === 0)).toBe(true);
  });

  it('keeps arrival order between two waiters for the same place', async () => {
    const blockers: RequestPermit[] = [];
    for (let index = 0; index < PREPARATION_CONCURRENCY; index += 1) {
      blockers.push(await pacer.acquire(-1, 'english'));
    }

    const granted: string[] = [];
    void pacer.acquire(3, 'english').then((permit) => {
      granted.push('first');
      permit.release();
    });
    void pacer.acquire(3, 'english').then((permit) => {
      granted.push('second');
      permit.release();
    });

    blockers.forEach((blocker) => {
      blocker.release();
    });
    await settle();

    expect(granted).toEqual(['first', 'second']);
  });

  it('frees the slot when the holder throws, as long as it releases', async () => {
    const permit = await pacer.acquire(0, 'english');
    try {
      throw new Error('the request failed');
    } catch {
      permit.release();
    }

    expect(pacer.active).toBe(0);
  });

  it('counts a permit released twice only once', async () => {
    const first = await pacer.acquire(0, 'english');
    const second = await pacer.acquire(1, 'english');
    first.release();
    first.release();

    expect(pacer.active).toBe(1);
    second.release();
    expect(pacer.active).toBe(0);
  });

  it('rejects a queued waiter when its run is cancelled', async () => {
    const blockers: RequestPermit[] = [];
    for (let index = 0; index < PREPARATION_CONCURRENCY; index += 1) {
      blockers.push(await pacer.acquire(0, 'english'));
    }
    const controller = new AbortController();
    const queued = pacer.acquire(1, 'english', controller.signal);

    controller.abort();

    await expect(queued).rejects.toBeDefined();
    expect(pacer.queued).toBe(0);
    blockers.forEach((blocker) => {
      blocker.release();
    });
  });

  it('refuses an already-cancelled caller without queueing it', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(pacer.acquire(0, 'english', controller.signal)).rejects.toBeDefined();
    expect(pacer.queued).toBe(0);
    expect(pacer.active).toBe(0);
  });

  describe('backing off after a rate limit', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('delays new grants without disturbing what is already in flight', async () => {
      const inFlight = await pacer.acquire(0, 'english');

      pacer.backOff(5_000);
      let grantedAt: number | null = null;
      void pacer.acquire(1, 'english').then((permit) => {
        grantedAt = Date.now();
        permit.release();
      });

      await settle();
      expect(grantedAt).toBeNull();
      // The request that was already running is untouched by the hold.
      expect(pacer.active).toBe(1);
      inFlight.release();

      await vi.advanceTimersByTimeAsync(5_000);
      await settle();
      expect(grantedAt).not.toBeNull();
    });

    it('extends a hold rather than letting a second refusal shorten it', async () => {
      pacer.backOff(10_000);
      pacer.backOff(1_000);

      let granted = false;
      void pacer.acquire(0, 'english').then((permit) => {
        granted = true;
        permit.release();
      });

      await vi.advanceTimersByTimeAsync(2_000);
      await settle();
      expect(granted).toBe(false);

      await vi.advanceTimersByTimeAsync(9_000);
      await settle();
      expect(granted).toBe(true);
    });
  });
});
