import { signal } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { AppBusyRegistry } from './app-busy.registry';

describe('AppBusyRegistry', () => {
  it('is not busy with no reasons registered', () => {
    const registry = new AppBusyRegistry();

    expect(registry.isBusy()).toBe(false);
    expect(registry.busyReason()).toBeNull();
  });

  it('becomes busy once a reason is registered, and reports it', () => {
    const registry = new AppBusyRegistry();

    registry.setBusy('generation', 'a story is being generated');

    expect(registry.isBusy()).toBe(true);
    expect(registry.busyReason()).toBe('a story is being generated');
  });

  it('clears busy when the reason is set to null, independent of other reasons', () => {
    const registry = new AppBusyRegistry();

    registry.setBusy('generation', 'a story is being generated');
    registry.setBusy('import-draft', 'an import draft is unsaved');
    registry.setBusy('generation', null);

    expect(registry.isBusy()).toBe(true);
    expect(registry.busyReason()).toBe('an import draft is unsaved');

    registry.setBusy('import-draft', null);

    expect(registry.isBusy()).toBe(false);
    expect(registry.busyReason()).toBeNull();
  });

  it('follows a tracked signal, beside reasons set directly, until it is released', () => {
    const registry = new AppBusyRegistry();
    const reason = signal<string | null>(null);

    const release = registry.track('generation', reason);
    expect(registry.isBusy()).toBe(false);

    reason.set('a story is being generated');
    registry.setBusy('import-draft', 'an import draft is unsaved');
    expect(registry.isBusy()).toBe(true);
    expect(registry.busyReason()).toBe('an import draft is unsaved');

    registry.setBusy('import-draft', null);
    expect(registry.busyReason()).toBe('a story is being generated');

    release();
    expect(registry.isBusy()).toBe(false);
  });
});
