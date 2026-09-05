import { TestBed } from '@angular/core/testing';
import { SwUpdate } from '@angular/service-worker';
import { firstValueFrom, Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import type { AppUpdateEvent } from '../../domain/platform/app-update.port';
import { ServiceWorkerUpdateAdapter } from './service-worker-update.adapter';

function fakeSwUpdate(isEnabled: boolean) {
  return {
    isEnabled,
    versionUpdates: new Subject(),
    unrecoverable: new Subject(),
    checkForUpdate: vi.fn(() => Promise.resolve(true)),
    activateUpdate: vi.fn(() => Promise.resolve(true)),
  };
}

function configure(sw: ReturnType<typeof fakeSwUpdate>) {
  TestBed.configureTestingModule({
    providers: [ServiceWorkerUpdateAdapter, { provide: SwUpdate, useValue: sw }],
  });
  return TestBed.inject(ServiceWorkerUpdateAdapter);
}

describe('ServiceWorkerUpdateAdapter', () => {
  it('reports unsupported and no-ops check/activate when the worker is disabled', async () => {
    const sw = fakeSwUpdate(false);
    const adapter = configure(sw);

    const event = await firstValueFrom(adapter.updates());
    expect(event).toEqual({ kind: 'unsupported' });

    expect(await adapter.check()).toEqual({ ok: true, value: undefined });
    expect(await adapter.activate()).toEqual({ ok: true, value: undefined });
    expect(sw.checkForUpdate).not.toHaveBeenCalled();
    expect(sw.activateUpdate).not.toHaveBeenCalled();
  });

  it('maps VERSION_READY to a ready event', async () => {
    const sw = fakeSwUpdate(true);
    const adapter = configure(sw);

    const next = firstValueFrom(adapter.updates());
    sw.versionUpdates.next({
      type: 'VERSION_READY',
      currentVersion: { hash: 'a' },
      latestVersion: { hash: 'b' },
    });

    const event: AppUpdateEvent = await next;
    expect(event).toEqual({ kind: 'ready' });
  });

  it('maps VERSION_INSTALLATION_FAILED to an installation-failed event', async () => {
    const sw = fakeSwUpdate(true);
    const adapter = configure(sw);

    const next = firstValueFrom(adapter.updates());
    sw.versionUpdates.next({
      type: 'VERSION_INSTALLATION_FAILED',
      version: { hash: 'a' },
      error: 'boom',
    });

    const event: AppUpdateEvent = await next;
    expect(event).toEqual({ kind: 'installation-failed', reason: 'boom' });
  });

  it('ignores version-detected events the app does not act on', () => {
    const sw = fakeSwUpdate(true);
    const adapter = configure(sw);
    const seen: AppUpdateEvent[] = [];
    adapter.updates().subscribe((event) => seen.push(event));

    sw.versionUpdates.next({ type: 'VERSION_DETECTED', version: { hash: 'a' } });
    sw.versionUpdates.next({
      type: 'VERSION_READY',
      currentVersion: { hash: 'a' },
      latestVersion: { hash: 'b' },
    });

    expect(seen).toEqual([{ kind: 'ready' }]);
  });

  it('maps UNRECOVERABLE_STATE to an unrecoverable event', async () => {
    const sw = fakeSwUpdate(true);
    const adapter = configure(sw);

    const next = firstValueFrom(adapter.updates());
    sw.unrecoverable.next({ type: 'UNRECOVERABLE_STATE', reason: 'corrupt cache' });

    const event: AppUpdateEvent = await next;
    expect(event).toEqual({ kind: 'unrecoverable', reason: 'corrupt cache' });
  });

  it('checks and activates through the underlying SwUpdate when enabled', async () => {
    const sw = fakeSwUpdate(true);
    const adapter = configure(sw);

    expect(await adapter.check()).toEqual({ ok: true, value: undefined });
    expect(await adapter.activate()).toEqual({ ok: true, value: undefined });
    expect(sw.checkForUpdate).toHaveBeenCalledOnce();
    expect(sw.activateUpdate).toHaveBeenCalledOnce();
  });

  it('reports a check failure as a typed error', async () => {
    const sw = fakeSwUpdate(true);
    sw.checkForUpdate = vi.fn(() => Promise.reject(new Error('network down')));
    const adapter = configure(sw);

    expect(await adapter.check()).toEqual({ ok: false, error: { message: 'network down' } });
  });

  it('reports an activation failure as a typed error', async () => {
    const sw = fakeSwUpdate(true);
    sw.activateUpdate = vi.fn(() => Promise.reject(new Error('activation broke')));
    const adapter = configure(sw);

    expect(await adapter.activate()).toEqual({
      ok: false,
      error: { message: 'activation broke' },
    });
  });
});
