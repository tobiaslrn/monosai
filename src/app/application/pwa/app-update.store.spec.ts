import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  APP_RELOAD,
  APP_UPDATE_CHECKER,
  type AppUpdateChecker,
  type AppUpdateCheckFailure,
  type AppUpdateEvent,
} from '../../domain/platform/app-update.port';
import { err, ok, type Result } from '../../domain/shared/result';
import { AppBusyRegistry } from '../shared/app-busy.registry';
import { AppUpdateStore } from './app-update.store';

class FakeUpdateChecker implements AppUpdateChecker {
  readonly events = new Subject<AppUpdateEvent>();
  checkCalls = 0;
  activateCalls = 0;
  checkResult: Result<void, AppUpdateCheckFailure> = ok(undefined);
  activateResult: Result<void, AppUpdateCheckFailure> = ok(undefined);

  updates() {
    return this.events.asObservable();
  }

  check() {
    this.checkCalls += 1;
    return Promise.resolve(this.checkResult);
  }

  activate() {
    this.activateCalls += 1;
    return Promise.resolve(this.activateResult);
  }
}

describe('AppUpdateStore', () => {
  let checker: FakeUpdateChecker;
  let reloadCalls: number;
  let busy: AppBusyRegistry;

  beforeEach(() => {
    checker = new FakeUpdateChecker();
    reloadCalls = 0;
    TestBed.configureTestingModule({
      providers: [
        { provide: APP_UPDATE_CHECKER, useValue: checker },
        { provide: APP_RELOAD, useValue: () => (reloadCalls += 1) },
      ],
    });
    busy = TestBed.inject(AppBusyRegistry);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  function store(): AppUpdateStore {
    return TestBed.inject(AppUpdateStore);
  }

  it('starts idle', () => {
    expect(store().status()).toEqual({ kind: 'idle' });
  });

  it('reports unsupported when the platform has no service worker', () => {
    const instance = store();
    checker.events.next({ kind: 'unsupported' });

    expect(instance.status()).toEqual({ kind: 'unsupported' });
  });

  it('becomes available when a version is ready', () => {
    const instance = store();
    checker.events.next({ kind: 'ready' });

    expect(instance.status()).toEqual({ kind: 'available' });
    expect(instance.canActivate()).toBe(true);
  });

  it('reports a failed installation with a reload recovery', () => {
    const instance = store();
    checker.events.next({ kind: 'installation-failed', reason: 'network error' });

    expect(instance.status()).toEqual({
      kind: 'failed',
      message: 'network error',
      recovery: 'reload',
    });
  });

  it('reports an unrecoverable state with a reload recovery', () => {
    const instance = store();
    checker.events.next({ kind: 'unrecoverable', reason: 'missing chunk' });

    expect(instance.status()).toEqual({
      kind: 'failed',
      message: 'missing chunk',
      recovery: 'reload',
    });
  });

  it('activates and performs a controlled reload when idle', async () => {
    const instance = store();
    checker.events.next({ kind: 'ready' });

    await instance.activate();

    expect(checker.activateCalls).toBe(1);
    expect(reloadCalls).toBe(1);
  });

  it('refuses to activate while busy work is in progress, and never reloads', async () => {
    const instance = store();
    checker.events.next({ kind: 'ready' });
    busy.setBusy('import-draft', 'an import draft is unsaved');

    expect(instance.canActivate()).toBe(false);
    await instance.activate();

    expect(checker.activateCalls).toBe(0);
    expect(reloadCalls).toBe(0);
    expect(instance.status()).toEqual({ kind: 'available' });
  });

  it('refuses to activate when there is nothing available', async () => {
    const instance = store();

    await instance.activate();

    expect(checker.activateCalls).toBe(0);
    expect(reloadCalls).toBe(0);
  });

  it('reports a failure and does not reload when activation fails', async () => {
    checker.activateResult = err({ message: 'activation failed' });
    const instance = store();
    checker.events.next({ kind: 'ready' });

    await instance.activate();

    expect(reloadCalls).toBe(0);
    expect(instance.status()).toEqual({
      kind: 'failed',
      message: 'activation failed',
      recovery: 'retry',
    });
  });

  it('dismisses an available update back to idle for the session', () => {
    const instance = store();
    checker.events.next({ kind: 'ready' });

    instance.dismiss();

    expect(instance.status()).toEqual({ kind: 'idle' });
  });

  it('reloadNow reloads directly without going through activation', () => {
    const instance = store();

    instance.reloadNow();

    expect(checker.activateCalls).toBe(0);
    expect(reloadCalls).toBe(1);
  });

  it('reloadNow refuses while busy work is in progress', () => {
    const instance = store();
    busy.setBusy('generation', 'a story is being generated');

    instance.reloadNow();

    expect(reloadCalls).toBe(0);
  });

  it('records a failure when a check fails', async () => {
    checker.checkResult = err({ message: 'check failed' });
    const instance = store();

    await instance.check();

    expect(instance.status()).toEqual({
      kind: 'failed',
      message: 'check failed',
      recovery: 'retry',
    });
  });
});
