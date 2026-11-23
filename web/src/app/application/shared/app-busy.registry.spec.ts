import { signal } from '@angular/core';
import { describe, expect, it } from 'vitest';
import type { BusyWork } from '../../domain/shared/busy-work';
import { AppBusyRegistry } from './app-busy.registry';

const ONE_STORY: BusyWork = { kind: 'story-generation', count: 1 };
const DRAFT: BusyWork = { kind: 'import-draft' };

describe('AppBusyRegistry', () => {
  it('is not busy with no reasons registered', () => {
    const registry = new AppBusyRegistry();

    expect(registry.isBusy()).toBe(false);
    expect(registry.busyWork()).toBeNull();
  });

  it('follows a tracked signal, and reports its work', () => {
    const registry = new AppBusyRegistry();
    const reason = signal<BusyWork | null>(null);

    registry.track('generation', reason);
    expect(registry.isBusy()).toBe(false);

    reason.set(ONE_STORY);
    expect(registry.isBusy()).toBe(true);
    expect(registry.busyWork()).toEqual(ONE_STORY);
  });

  it('keeps one reason when another clears', () => {
    const registry = new AppBusyRegistry();
    const generation = signal<BusyWork | null>(ONE_STORY);
    const draft = signal<BusyWork | null>(DRAFT);

    registry.track('generation', generation);
    registry.track('import-draft', draft);
    generation.set(null);

    expect(registry.isBusy()).toBe(true);
    expect(registry.busyWork()).toEqual(DRAFT);

    draft.set(null);

    expect(registry.isBusy()).toBe(false);
    expect(registry.busyWork()).toBeNull();
  });

  it('stops following a released signal', () => {
    const registry = new AppBusyRegistry();

    const release = registry.track('generation', signal(ONE_STORY));
    release();

    expect(registry.isBusy()).toBe(false);
  });

  it('does not let a stale release drop the signal that replaced it', () => {
    const registry = new AppBusyRegistry();

    const stale = registry.track('import-draft', signal<BusyWork | null>(ONE_STORY));
    registry.track('import-draft', signal<BusyWork | null>(DRAFT));
    stale();

    expect(registry.busyWork()).toEqual(DRAFT);
  });
});
