import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { AppBusyRegistry } from '../../application/shared/app-busy.registry';
import {
  APP_RELOAD,
  APP_UPDATE_CHECKER,
  type AppUpdateChecker,
  type AppUpdateEvent,
} from '../../domain/platform/app-update.port';
import { ok } from '../../domain/shared/result';
import { AppUpdateBannerComponent } from './app-update-banner.component';

class FakeChecker implements AppUpdateChecker {
  readonly events = new Subject<AppUpdateEvent>();
  updates() {
    return this.events.asObservable();
  }
  check() {
    return Promise.resolve(ok(undefined));
  }
  activate() {
    return Promise.resolve(ok(undefined));
  }
}

function render() {
  const checker = new FakeChecker();
  TestBed.configureTestingModule({
    providers: [
      { provide: APP_UPDATE_CHECKER, useValue: checker },
      { provide: APP_RELOAD, useValue: () => undefined },
    ],
  });
  const busy = TestBed.inject(AppBusyRegistry);
  const fixture = TestBed.createComponent(AppUpdateBannerComponent);
  fixture.detectChanges();
  return { fixture, checker, busy, element: fixture.nativeElement as HTMLElement };
}

describe('AppUpdateBannerComponent', () => {
  it('renders nothing while idle', () => {
    const { element } = render();

    expect(element.querySelector('.banner')).toBeNull();
  });

  it('shows a non-modal status banner, never a dialog, once an update is available', () => {
    const { fixture, checker, element } = render();

    checker.events.next({ kind: 'ready' });
    fixture.detectChanges();

    const banner = element.querySelector('.banner');
    expect(banner).not.toBeNull();
    expect(banner?.getAttribute('role')).toBe('status');
    expect(banner?.getAttribute('aria-live')).toBe('polite');
    expect(element.querySelector('dialog, [role="dialog"]')).toBeNull();
    expect(document.activeElement).not.toBe(banner);
    expect(banner?.textContent).toContain('has downloaded');
  });

  it('disables the update action and explains why while busy work is in progress', () => {
    const { fixture, checker, busy, element } = render();
    checker.events.next({ kind: 'ready' });
    busy.setBusy('generation', 'a story is being generated');
    fixture.detectChanges();

    const enabledButton = element.querySelector('button:not([disabled])');
    const disabledButton = element.querySelector('button[disabled]');
    expect(disabledButton).not.toBeNull();
    expect(disabledButton?.textContent).toContain('Update and reload');
    expect(enabledButton).toBeNull();
    expect(element.textContent).toContain('a story is being generated');
  });

  it('offers a reload action for an unrecoverable state', () => {
    const { fixture, checker, element } = render();

    checker.events.next({ kind: 'unrecoverable', reason: 'missing chunk' });
    fixture.detectChanges();

    const banner = element.querySelector('.banner');
    expect(banner?.textContent).toContain('missing chunk');
    const buttons = [...element.querySelectorAll('button')];
    const reloadButton = buttons.find((el) => el.textContent.includes('Reload to recover'));
    expect(reloadButton).toBeDefined();
  });
});
