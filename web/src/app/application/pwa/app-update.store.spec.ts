import { signal } from '@angular/core';
import type { BusyWork } from '../../domain/shared/busy-work';
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
  checkResult: Result<void, AppUpdateCheckFailure> = ok(undefined);

  updates() {
    return this.events.asObservable();
  }

  check() {
    this.checkCalls += 1;
    return Promise.resolve(this.checkResult);
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

  it('checks silently: a failed check shows nothing and reloads nothing', async () => {
    checker.checkResult = err({ message: 'check failed' });
    const instance = store();

    await instance.check();

    expect(checker.checkCalls).toBe(1);
    expect(instance.status()).toEqual({ kind: 'idle' });
    expect(reloadCalls).toBe(0);
  });

  it('checks again when the tab becomes visible', () => {
    store();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');

    document.dispatchEvent(new Event('visibilitychange'));

    expect(checker.checkCalls).toBe(1);
  });

  it('reports an unrecoverable worker state', () => {
    const instance = store();
    checker.events.next({ kind: 'unrecoverable', reason: 'missing chunk' });

    expect(instance.status()).toEqual({ kind: 'failed', message: 'missing chunk' });
  });

  it('reloadNow reloads', () => {
    const instance = store();

    instance.reloadNow();

    expect(reloadCalls).toBe(1);
  });

  it('reloadNow refuses while busy work is in progress', () => {
    const instance = store();
    busy.track('generation', signal<BusyWork | null>({ kind: 'story-generation', count: 1 }));

    instance.reloadNow();

    expect(reloadCalls).toBe(0);
  });

  describe('a reload that would lose an unsaved story', () => {
    const unsaved = (count: number) =>
      busy.track('generation-unsaved', signal<BusyWork | null>({ kind: 'unsaved-story', count }));

    it('is not held by it, and reloads once the learner agreed to lose it', () => {
      const instance = store();
      unsaved(2);

      expect(instance.unsavedStories()).toBe(2);
      expect(instance.holdingWork()).toEqual([]);
      instance.reloadNow(2);

      expect(reloadCalls).toBe(1);
      // The browser is not asked the same question again.
      expect(busy.unloadAccepted()).toBe(true);
    });

    it('refuses without the learner agreeing to lose every one', () => {
      const instance = store();
      unsaved(2);

      instance.reloadNow();
      instance.reloadNow(1);

      expect(reloadCalls).toBe(0);
      expect(busy.unloadAccepted()).toBe(false);
    });

    it('still waits for other work', () => {
      const instance = store();
      unsaved(1);
      busy.track('generation', signal<BusyWork | null>({ kind: 'story-generation', count: 1 }));

      instance.reloadNow(1);

      expect(instance.holdingWork()).toEqual([{ kind: 'story-generation', count: 1 }]);
      expect(reloadCalls).toBe(0);
    });
  });

  it('downloads a newer build before reloading into it', async () => {
    let reloadsWhenChecked = -1;
    checker.check = () => {
      reloadsWhenChecked = reloadCalls;
      return Promise.resolve(ok(undefined));
    };

    await store().reloadIntoLatest();

    expect(reloadsWhenChecked).toBe(0);
    expect(reloadCalls).toBe(1);
  });

  it('still reloads when the check fails', async () => {
    checker.checkResult = err({ message: 'check failed' });

    await store().reloadIntoLatest();

    expect(reloadCalls).toBe(1);
  });

  it('offers a reload, without performing one, when another tab took the database', () => {
    const instance = store();

    instance.reportDatabaseLost('another-tab');

    expect(instance.status()).toMatchObject({
      kind: 'superseded',
      message: expect.stringContaining('another tab') as unknown,
    });
    expect(reloadCalls).toBe(0);
  });

  it('does not blame another tab when the browser closed the connection', () => {
    const instance = store();

    instance.reportDatabaseLost('connection-closed');

    const status = instance.status();
    expect(status.kind).toBe('superseded');
    expect(status.kind === 'superseded' && status.message).not.toContain('another tab');
  });

  describe('once the database is lost', () => {
    function superseded(): AppUpdateStore {
      const instance = store();
      instance.reportDatabaseLost('another-tab');
      return instance;
    }

    it('keeps the notice through checks and worker failures', async () => {
      const instance = superseded();

      await instance.check();
      checker.checkResult = err({ message: 'check failed' });
      await instance.check();
      checker.events.next({ kind: 'unrecoverable', reason: 'y' });

      expect(instance.status().kind).toBe('superseded');
    });

    it('reloads even while work is unsaved, because saving can no longer succeed', () => {
      const instance = superseded();
      busy.track('import-draft', signal<BusyWork | null>({ kind: 'import-draft' }));

      instance.reloadSuperseded();

      expect(reloadCalls).toBe(1);
      // The learner confirmed in Monosai; the browser does not ask again.
      expect(busy.unloadAccepted()).toBe(true);
    });

    it('keeps the first cause', () => {
      const instance = superseded();

      instance.reportDatabaseLost('connection-closed');

      expect(instance.status()).toMatchObject({
        message: expect.stringContaining('another tab') as unknown,
      });
    });
  });
});
