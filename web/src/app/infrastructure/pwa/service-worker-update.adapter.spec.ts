import { TestBed } from '@angular/core/testing';
import { SwUpdate } from '@angular/service-worker';
import { firstValueFrom, Subject, toArray } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import type { AppUpdateEvent } from '../../domain/platform/app-update.port';
import { ServiceWorkerUpdateAdapter } from './service-worker-update.adapter';

function fakeSwUpdate(isEnabled: boolean) {
  return {
    isEnabled,
    versionUpdates: new Subject(),
    unrecoverable: new Subject(),
    checkForUpdate: vi.fn(() => Promise.resolve(true)),
  };
}

function configure(sw: ReturnType<typeof fakeSwUpdate>) {
  TestBed.configureTestingModule({
    providers: [ServiceWorkerUpdateAdapter, { provide: SwUpdate, useValue: sw }],
  });
  return TestBed.inject(ServiceWorkerUpdateAdapter);
}

describe('ServiceWorkerUpdateAdapter', () => {
  it('emits nothing and does not check when the worker is disabled', async () => {
    const sw = fakeSwUpdate(false);
    const adapter = configure(sw);

    expect(await firstValueFrom(adapter.updates().pipe(toArray()))).toEqual([]);
    expect(await adapter.check()).toEqual({ ok: true, value: undefined });
    expect(sw.checkForUpdate).not.toHaveBeenCalled();
  });

  it('passes on no version events, since the next load picks a new version up by itself', () => {
    const sw = fakeSwUpdate(true);
    const adapter = configure(sw);
    const seen: AppUpdateEvent[] = [];
    adapter.updates().subscribe((event) => seen.push(event));

    sw.versionUpdates.next({ type: 'VERSION_DETECTED', version: { hash: 'b' } });
    sw.versionUpdates.next({
      type: 'VERSION_READY',
      currentVersion: { hash: 'a' },
      latestVersion: { hash: 'b' },
    });
    sw.versionUpdates.next({ type: 'NO_NEW_VERSION_DETECTED', version: { hash: 'b' } });

    expect(seen).toEqual([]);
  });

  it('maps UNRECOVERABLE_STATE to an unrecoverable event', async () => {
    const sw = fakeSwUpdate(true);
    const adapter = configure(sw);

    const next = firstValueFrom(adapter.updates());
    sw.unrecoverable.next({ type: 'UNRECOVERABLE_STATE', reason: 'corrupt cache' });

    const event: AppUpdateEvent = await next;
    expect(event).toEqual({ kind: 'unrecoverable', reason: 'corrupt cache' });
  });

  it('checks through the underlying SwUpdate when enabled', async () => {
    const sw = fakeSwUpdate(true);
    const adapter = configure(sw);

    expect(await adapter.check()).toEqual({ ok: true, value: undefined });
    expect(sw.checkForUpdate).toHaveBeenCalledOnce();
  });

  it('reports a check failure as a typed error', async () => {
    const sw = fakeSwUpdate(true);
    sw.checkForUpdate = vi.fn(() => Promise.reject(new Error('network down')));
    const adapter = configure(sw);

    expect(await adapter.check()).toEqual({ ok: false, error: { message: 'network down' } });
  });
});
