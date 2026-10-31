import { signal } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { AppBusyRegistry } from './app-busy.registry';

describe('AppBusyRegistry', () => {
  it('is not busy with no reasons registered', () => {
    const registry = new AppBusyRegistry();

    expect(registry.isBusy()).toBe(false);
    expect(registry.busyReason()).toBeNull();
  });

  it('follows a tracked signal, and reports its reason', () => {
    const registry = new AppBusyRegistry();
    const reason = signal<string | null>(null);

    registry.track('generation', reason);
    expect(registry.isBusy()).toBe(false);

    reason.set('a story is being generated');
    expect(registry.isBusy()).toBe(true);
    expect(registry.busyReason()).toBe('a story is being generated');
  });

  it('keeps one reason when another clears', () => {
    const registry = new AppBusyRegistry();
    const generation = signal<string | null>('a story is being generated');
    const draft = signal<string | null>('an import draft is unsaved');

    registry.track('generation', generation);
    registry.track('import-draft', draft);
    generation.set(null);

    expect(registry.isBusy()).toBe(true);
    expect(registry.busyReason()).toBe('an import draft is unsaved');

    draft.set(null);

    expect(registry.isBusy()).toBe(false);
    expect(registry.busyReason()).toBeNull();
  });

  it('stops following a released signal', () => {
    const registry = new AppBusyRegistry();

    const release = registry.track('generation', signal('a story is being generated'));
    release();

    expect(registry.isBusy()).toBe(false);
  });

  it('does not let a stale release drop the signal that replaced it', () => {
    const registry = new AppBusyRegistry();

    const stale = registry.track('import-draft', signal('old draft'));
    registry.track('import-draft', signal('new draft'));
    stale();

    expect(registry.busyReason()).toBe('new draft');
  });
});
